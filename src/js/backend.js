"use strict";

const pathJs = require("path");
const fs = require("fs");
const { performance } = require("perf_hooks");
const exifr = require("exifr");
const spawn = require("child_process").spawn;
const glob = require("glob");
const PromiseBB = require("bluebird");
const { ipcMain } = require("electron");

const helpers = require("./helpers");

var imageContainer = {};

// Requiring module
var process = require("process");

async function getImages(userPath) {
  const startTime = performance.now() / 1000;

  try {
    // Store SETS in array
    const setPattern = /^[0-9][0-9][0-9][0-9]SET$/;
    let setDirectories = await helpers.getDirectories(userPath);
    setDirectories = setDirectories.filter((item) => item.match(setPattern));

    // JSON to store image paths and metadata
    imageContainer = {};

    const metadataOptions = {
      tiff: false,
      xmp: true,
      gps: false,
    };

    // Iterate through each SET
    for (const SET of setDirectories) {
      // create keys in image container for each SET
      imageContainer[SET] = {};

      const subsetPattern = /^[0-9][0-9][0-9]$/;
      let subsetDirectories = await helpers.getDirectories(
        pathJs.join(userPath, SET)
      );

      subsetDirectories = subsetDirectories.filter((item) =>
        item.match(subsetPattern)
      );

      // store image files from all subsets in the specified SET
      const imgPattern = /^IMG_[0-9][0-9][0-9][0-9]_[1-6].tif$/;
      for (const subset of subsetDirectories) {
        // create keys in image container for each subset
        imageContainer[SET][subset] = {};
        imageContainer[SET][subset]["images"] = [];
        imageContainer[SET][subset]["metadata"] = [];

        let subsetImages = await fs.promises.readdir(
          pathJs.join(userPath, SET, subset)
        );
        subsetImages = subsetImages.filter((item) => item.match(imgPattern));
        await PromiseBB.map(
          subsetImages,
          async (img) => {
            const buffer = await fs.promises.readFile(
              pathJs.join(userPath, SET, subset, img),
              {
                flag: "r",
              }
            );

            let metadata;
            let metadataGPS;
            try {
              metadata = await exifr.parse(buffer, metadataOptions);
            } catch {
              metadata = {};
            }

            try {
              metadataGPS = await exifr.gps(buffer);
              if (Object.keys(metadata).length !== 0) {
                // add gps to metadata object
                metadata["latitude"] = metadataGPS["latitude"];
                metadata["longitude"] = metadataGPS["longitude"];
              }
            } catch {}

            const formatMemoryUsage = (data) =>
              `${Math.round((data / 1024 / 1024) * 100) / 100} MB`;

            const memoryData = process.memoryUsage();

            const memoryUsage = {
              rss: `${formatMemoryUsage(
                memoryData.rss
              )} -> Resident Set Size - total memory allocated for the process execution`,
              heapTotal: `${formatMemoryUsage(
                memoryData.heapTotal
              )} -> total size of the allocated heap`,
              heapUsed: `${formatMemoryUsage(
                memoryData.heapUsed
              )} -> actual memory used during the execution`,
              external: `${formatMemoryUsage(
                memoryData.external
              )} -> V8 external memory`,
              arrayBuffers: formatMemoryUsage(memoryData.arrayBuffers),
            };

            imageContainer[SET][subset]["images"].push(img);
            imageContainer[SET][subset]["metadata"].push(metadata);
          },
          { concurrency: 200 }
        );

        // sort images for each set due to parallelism
        const x = imageContainer[SET][subset]["images"];
        const y = imageContainer[SET][subset]["metadata"];

        // map the arrays together
        const combinedArray = x.map((name, index) => ({
          name,
          metadata: y[index],
        }));

        combinedArray.sort((a, b) => a.name.localeCompare(b.name));

        // store the sorted values back to imageContainer
        for (let i = 0; i < combinedArray.length; i++) {
          imageContainer[SET][subset]["images"][i] = combinedArray[i].name;
          imageContainer[SET][subset]["metadata"][i] =
            combinedArray[i].metadata;
        }
      }
    }

    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);

    return [totalTime, "success"];
  } catch (err) {
    console.error(err);
    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);

    return [totalTime, "fail"];
  }
}

async function detectMissingBands() {
  // [[missing sets], set count, total time, flag]
  let msgs = [];
  const startTime = performance.now() / 1000;
  try {
    let missingSet = false;
    let resultMsg = "success";
    // let imgsCounter = 0;
    let setCounter = 0;

    // Iterate through each SET
    for (const SET of Object.keys(imageContainer)) {
      for (const subset of Object.keys(imageContainer[SET])) {
        let images = imageContainer[SET][subset]["images"];
        let testList = [];

        // Check if subset is empty
        if (images.length === 0) continue;

        // imgsCounter += images.length;

        // get unique images capture IDs
        testList = images.map((item) => item.split("_")[1]);
        let uniqueCaptures = [...new Set(testList)];
        setCounter += uniqueCaptures.length;
        testList = [];

        for (const capture of uniqueCaptures) {
          testList = images.filter((item) => item.split("_")[1] === capture);

          // Check if there are less than 6 bands in each capture
          if (testList.length < 6) {
            msgs.push([
              `Incomplete capture detected: ${capture}`,
              6 - testList.length,
              capture,
            ]);
            // console.log(`MISSING LIST: ${testList}`);

            missingSet = true;
          }
        }
      }
    }

    if (missingSet == false) {
      resultMsg = "success";
    } else {
      resultMsg = "missing";
    }

    // msgs.push(imgsCounter);
    msgs.push(setCounter);

    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);
    // console.log(`TOTAL TIME: ${totalTime}`);
    msgs.push(totalTime);
    msgs.push(resultMsg);
  } catch (err) {
    // console.log(`EXCEPTION: ${err}\n${err.lineNumber}`);
    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);
    msgs.push(totalTime);
    msgs.push("unexpected");
  }

  return msgs;
}

async function detectMissingTargetsAndIrradiance(userPath) {
  // Targets & Irradiance Msgs
  let allMsgs = [];

  /**
   * Targets variables
   */
  // full array containing results
  let msgs = [];

  // msgs array of checkCapture() results
  let subMsgs = [];

  // warning msgs
  let warningMsgs = { noExif: [], corrupted: [] };

  /**
   * Irradiance variables
   */
  let irradianceResultMsg = "missing";
  // [[missing irradiance messages, capture], total time, flag]
  let irradianceMsgs = [];
  let irradianceMissingFound = false;

  const startTime = performance.now() / 1000;
  // console.log(`START:  ${startTime}`);
  try {
    let resultMsg = "missing";

    // Store SETS in array
    for (const SET of Object.keys(imageContainer)) {
      for (const subset of Object.keys(imageContainer[SET])) {
        let images = imageContainer[SET][subset]["images"];
        let metadatas = imageContainer[SET][subset]["metadata"];
        let index = 0;

        for (const metadata of metadatas) {
          let img = images[index];
          let irrandianceCounter = 0;
          let exifTagPresent = false;

          // check if there is no metadata (corrupted img)
          try {
            if (Object.keys(metadata).length === 0) {
              // console.log(`No metadata (corrupted): ${img}`);
              warningMsgs.corrupted.push(
                pathJs.join(userPath, SET, subset, img)
              );

              continue;
            }
          } catch (error) {
            warningMsgs.corrupted.push(pathJs.join(userPath, SET, subset, img));
            continue;
          }

          for (const [key, value] of Object.entries(metadata)) {
            if (key.includes("Irradiance")) {
              irrandianceCounter += 1;
            } else if (key.includes("TriggerMethod")) {
              // Exif tag "TriggerMethod" found, set flag to true
              exifTagPresent = true;

              if (value == 0) {
                // check if set is complete
                const imgID = img.split("_")[1];
                const result = await helpers.checkCapture(
                  pathJs.join(userPath, SET, subset),
                  imgID,
                  images
                );

                subMsgs.push(result);
              }
            }
          }

          // Check if TriggerMethod tag was present
          if (!exifTagPresent) {
            // console.log(`No EXIF IMG: ${img}\n${Object.keys(metadata).length}`);
            warningMsgs.noExif.push(
              `Set: ${SET.split("SET")[0]} Img: ${
                img.split("_")[1].split(".")[0]
              }`
            );
          }

          // Check if irradiance tags were present
          if (irrandianceCounter === 0) {
            irradianceMissingFound = true;
            const imgID = img.split("_")[1] + "_" + img.split("_")[2];
            irradianceMsgs.push([
              `Set: ${SET.split("SET")[0]} Img: ${
                imgID.split(".")[0]
              } has no sun irriadiance data`,
              img.split("_")[1],
            ]);
          }

          index += 1;
        }
      }
    }

    /**
     * Targets results
     */
    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);
    msgs.push(warningMsgs);
    msgs.push(totalTime);
    msgs.push(subMsgs);

    /**
     * Irradiance results
     */
    irradianceMsgs.push(totalTime);
    if (irradianceMissingFound) {
      irradianceResultMsg = "missing";
    } else {
      irradianceResultMsg = "success";
    }
    irradianceMsgs.push(irradianceResultMsg);
  } catch (err) {
    // console.log(`EXCEPTION: ${err}\n${err.stack}`);

    /**
     * Targets results (unexpected)
     */
    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);
    msgs.push(totalTime);
    msgs.push("unexpected");

    /**
     * Irradiance results (unexpected)
     */
    irradianceMsgs.push(totalTime);
    irradianceMsgs.push("unexpected");
  }

  allMsgs.push(msgs);
  allMsgs.push(irradianceMsgs);
  return allMsgs;
}

async function plotMap() {
  const startTime = performance.now() / 1000;
  let lats = [];
  let longs = [];

  // 0 -> base64 output
  // 1 -> exif not found
  // 2 -> elapsed time
  // 3 -> result message
  let msgs = ["empty", " ", " ", " "];
  msgs[1] = "yes_exif";
  msgs[3] = "fail_map";
  let result_msg = "fail_map";

  // flag for missing gps
  let missingGPS = false;

  // Store SETS in array
  for (const SET of Object.keys(imageContainer)) {
    for (const subset of Object.keys(imageContainer[SET])) {
      let images = imageContainer[SET][subset]["images"];
      let currentImgID;
      let index = 0;

      for (const img of images) {
        let imgID = img.split("_")[1];

        if (imgID != currentImgID) {
          currentImgID = imgID;
          const metadata = imageContainer[SET][subset]["metadata"][index];

          // check if there is no metadata (corrupted img)
          try {
            if (Object.keys(metadata).length === 0) {
              // console.log(`No metadata (corrupted): ${img}`);
              continue;
            }
          } catch (error) {
            continue;
          }

          // Check if img has missing gps
          if (metadata.latitude == "0" || metadata.longitude == "0") {
            missingGPS = true;
            // console.log(`Skipping IMG: ${img}`);
            break;
          }

          lats.push(metadata.latitude);
          longs.push(metadata.longitude);
        }

        index += 1;
      }
    }
  }

  if (longs.length > 0 && lats.length > 0) {
    let gpsObj = { GPSLatitude: lats, GPSLongitude: longs };

    const currentScriptDirectory = __filename;

    // create temp directory
    let TEMP_DIR = pathJs.join(__dirname, "..", "helpers", "temp_files");
    const pathExists = !!(await fs.promises.stat(TEMP_DIR).catch((e) => false));
    if (!pathExists) {
      await fs.promises.mkdir(TEMP_DIR);
    }

    try {
      let filename = "FLIGHT_CHECKER_COORDINATES";
      let fileCounter = 1;
      let gpsJSONPath;

      // Export gps coordinates as JSON
      while (true) {
        if (
          !!(await fs.promises
            .stat(pathJs.join(TEMP_DIR, filename + ".json"))
            .catch((e) => false))
        ) {
          filename = "FLIGHT_CHECKER_COORDINATES_" + fileCounter.toString();
          fileCounter += 1;
        }

        // file doesn't exist
        else {
          await fs.promises.writeFile(
            pathJs.join(TEMP_DIR, filename + ".json"),
            JSON.stringify(gpsObj),
            "utf-8"
          );
          gpsJSONPath = pathJs.join(TEMP_DIR, filename + ".json");

          break;
        }
      }

      let RScript = pathJs.join(
        currentScriptDirectory,
        "..",
        "..",
        "helpers",
        "map.R"
      );
      let RExe = pathJs.join(
        currentScriptDirectory,
        "..",
        "..",
        "..",
        "R",
        "R-4.2.1",
        "bin",
        "Rscript.exe"
      );

      // Execute R script
      let returnValue;
      await new Promise((resolve, reject) => {
        const RProcess = spawn(RExe, [RScript, gpsJSONPath, "--vanilla"]);

        RProcess.stdout.on("data", (data) => {
          returnValue += data.toString();
          resolve(returnValue);
        });

        RProcess.stderr.on("data", (err) => {
          console.log("Error: " + String(err));
        });

        RProcess.on("close", (code) => {});
      });

      if (returnValue.includes("!@#!")) {
        // only extract main return value
        returnValue = returnValue.split("!@#!")[1];

        // Delete temporary JSON file(s)
        let globFiles;
        await new Promise((resolve, reject) => {
          glob(
            pathJs
              .join(TEMP_DIR, "FLIGHT_CHECKER_COORDINATES*.json")
              .replace(/\\/g, "/"),
            (err, files) => {
              globFiles = files;
              resolve(files);
            }
          );
        });

        for (const jsonFile of globFiles) {
          try {
            await fs.promises.unlink(jsonFile);
          } catch (err) {
            continue;
          }
        }

        // Process R output
        if (returnValue.includes("success")) {
          let filenamePoints = returnValue.split("*")[1];
          let filenameLines = returnValue.split("*")[2].slice(0, -3);

          let pointsBuf = await fs.promises.readFile(
            pathJs.join(TEMP_DIR, filenamePoints)
          );
          let linesBuf = await fs.promises.readFile(
            pathJs.join(TEMP_DIR, filenameLines)
          );

          let fullPBuffer =
            "data:image/png;base64," + pointsBuf.toString("base64");
          let fullLBuffer =
            "data:image/png;base64," + linesBuf.toString("base64");

          // Delete temp PNG plots
          let globFilesPNG;
          await new Promise((resolve, reject) => {
            glob(
              pathJs
                .join(TEMP_DIR, "FLIGHT_CHECKER_IMAGES_PLOT*.png")
                .replace(/\\/g, "/"),
              (err, files) => {
                globFilesPNG = files;
                resolve(files);
              }
            );
          });

          for (const pngFile of globFilesPNG) {
            try {
              await fs.promises.unlink(pngFile);
            } catch (err) {
              continue;
            }
          }

          msgs[0] = [fullPBuffer, fullLBuffer];

          if (missingGPS) result_msg = "success_gps";
          else result_msg = "success";
        } else {
          result_msg = "fail_map";
        }
      } else {
        result_msg = "fail_map";
      }
    } catch (err) {
      console.error(err);
      result_msg = "fail_map";
    }

    msgs[3] = result_msg;
  } else {
    msgs[3] = "fail_coordinates";
  }
  const endTime = performance.now() / 1000;
  const totalTime = (endTime - startTime).toFixed(2);
  msgs[2] = totalTime;

  console.log(result_msg);

  return msgs;
}

async function test() {
  const path = "G:\\tests\\missing_bands";
  let result = await getImages(path);
  // console.log(await detectMissingBands());

  // await plotMap();
}

// test();

module.exports = {
  getImages,
  detectMissingBands,
  detectMissingTargetsAndIrradiance,
  plotMap,
};
