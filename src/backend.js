"use strict";

const pathJs = require("path");
const fs2 = require("fs").promises;
const { performance } = require("perf_hooks");
const exifr = require("exifr");
const spawn = require("child_process").spawn;
const glob = require("glob");
const PromiseBB = require("bluebird");

async function detectMissingBands(path) {
  let msgs = [];
  const startTime = performance.now() / 1000;
  try {
    let missingSet = false;
    let resultMsg = "success";
    let imgsCounter = 0;
    let imagerySet = [];

    const setDirectories = await getDirectories(path);

    // Store SETS in array
    for (const file of setDirectories) {
      if (file.includes("SET")) {
        imagerySet.push(file);
      }
    }

    // Wrong Directory
    if (imagerySet.length === 0) {
      resultMsg = "wrongDir";
      msgs.push(resultMsg);
      return msgs;
    }

    // Iterate through each SET
    for (const set of imagerySet) {
      let subsets = [];
      const subsetDirectories = await getDirectories(pathJs.join(path, set));

      for (const subFolder of subsetDirectories) {
        const fileStats = await fs2.stat(pathJs.join(path, set, subFolder));
        if (subFolder.includes("0") && fileStats.isDirectory()) {
          subsets.push(subFolder);
        }
      }

      // let imageNum = 0;

      // Iterate through each subset
      for (const subset of subsets) {
        let images = await fs2.readdir(pathJs.join(path, set, subset));
        const imgPattern = /^IMG_[0-9][0-9][0-9][0-9]_[1-6].tif$/;

        // remove any unintended files
        images = images.filter(
          (item) => item !== "Thumbs.db" && item.match(imgPattern)
        );

        let testList = [];
        // let endOfSubset = false;

        // Check if subset is empty
        if (images.length === 0) continue;

        imgsCounter += images.length;

        // get unique images capture IDs
        testList = images.map((item) => item.split("_")[1]);
        let uniqueCaptures = [...new Set(testList)];
        testList = [];

        for (const capture of uniqueCaptures) {
          testList = images.filter((item) => item.split("_")[1] === capture);

          // Check if there are less than 6 bands in each capture
          if (testList.length < 6) {
            msgs.push([
              `Uncomplete set detected: ${capture}`,
              6 - testList.length,
            ]);

            console.log(`MISSING LIST: ${testList}`);

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

    msgs.push(imgsCounter);

    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);
    console.log(`TOTAL TIME: ${totalTime}`);
    msgs.push(totalTime);
    msgs.push(resultMsg);
  } catch (err) {
    console.log(`EXCEPTION: ${err}\n${err.lineNumber}`);
    const endTime = performance.now() / 1000;
    const totalTime = (endTime - startTime).toFixed(2);
    msgs.push(totalTime);
    msgs.push("unexpected");
  }

  return msgs;
}

async function detectMissingTargetsAndIrradiance(path) {
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
  let irradianceMsgs = [];
  let irradianceMissingFound = false;

  const startTime = performance.now() / 1000;
  console.log(`START:  ${startTime}`);
  // let totalTime;
  try {
    let resultMsg = "missing";
    const setDirectories = await getDirectories(path);

    // Store SETS in array
    for (const dir of setDirectories) {
      if (dir.includes("SET")) {
        const subsetDirectories = await getDirectories(pathJs.join(path, dir));
        console.log(`SUB DIRS: ${subsetDirectories}`);

        for (const subset of subsetDirectories) {
          if (subset.includes("0")) {
            let images = await fs2.readdir(pathJs.join(path, dir, subset));

            // sort array (reading from USB can lead to different order)
            images.sort();
            const imgPattern = /^IMG_[0-9][0-9][0-9][0-9]_[1-6].tif$/;

            // remove any unintended files
            images = images.filter(
              (item) => item !== "Thumbs.db" && item.match(imgPattern)
            );

            let testStart = performance.now() / 1000;

            await PromiseBB.map(
              images,
              async function (img) {
                try {
                  const buffer = await fs2.readFile(
                    pathJs.join(path, dir, subset, img),
                    { flag: "r" }
                  );
                  const metadata = await exifr.parse(buffer, true);

                  let irrandianceCounter = 0;
                  let exifTagPresent = false;

                  for (const [key, value] of Object.entries(metadata)) {
                    if (key.includes("Irradiance")) {
                      irrandianceCounter += 1;
                    } else if (key.includes("TriggerMethod")) {
                      // Exif tag "TriggerMethod" found, set flag to true
                      exifTagPresent = true;

                      if (value == 0) {
                        // check if set is complete
                        const imgID = img.split("_")[1];
                        const result = await checkCapture(
                          pathJs.join(path, dir, subset),
                          imgID,
                          images
                        );

                        subMsgs.push(result);
                      }
                    }
                  }

                  // Check if TriggerMethod tag was present
                  if (!exifTagPresent) {
                    console.log(
                      `No EXIF IMG: ${img}\n${Object.keys(metadata).length}`
                    );
                    warningMsgs.noExif.push(
                      `Set: ${dir.split("SET")[0]} Img: ${imgID.split(".")[0]}`
                    );
                  }

                  // Check if irradiance tags were present
                  if (irrandianceCounter === 0) {
                    irradianceMissingFound = true;
                    const imgID = img.split("_")[1] + "_" + img.split("_")[2];
                    irradianceMsgs.push(
                      `Set: ${dir.split("SET")[0]} Img: ${
                        imgID.split(".")[0]
                      } has no sun irriadiance data`
                    );
                  }
                } catch (err) {
                  console.log(`Catched bad image: ${img}`);
                  // const imgID = img.split("_")[1] + "_" + img.split("_")[2];
                  warningMsgs.corrupted.push(
                    // `Set: ${dir.split("SET")[0]} Img: ${imgID.split(".")[0]}`
                    pathJs.join(path, dir, subset, img)
                  );

                  // continue;
                }
                let testEnd = performance.now() / 1000;
                console.log(
                  `Time for ${img}: ${(testEnd - testStart).toFixed(2)} `
                );
              },
              { concurrency: 500 }
            );

            // await Promise.all(
            //   images.map(async (img) => {
            //     try {
            //       const buffer = await fs2.readFile(
            //         pathJs.join(path, dir, subset, img),
            //         { flag: "r" }
            //       );
            //       const metadata = await exifr.parse(buffer, true);

            //       let irrandianceCounter = 0;
            //       let exifTagPresent = false;

            //       for (const [key, value] of Object.entries(metadata)) {
            //         if (key.includes("Irradiance")) {
            //           irrandianceCounter += 1;
            //         } else if (key.includes("TriggerMethod")) {
            //           // Exif tag "TriggerMethod" found, set flag to true
            //           exifTagPresent = true;

            //           if (value == 0) {
            //             // check if set is complete
            //             const imgID = img.split("_")[1];
            //             const result = await checkCapture(
            //               pathJs.join(path, dir, subset),
            //               imgID,
            //               images
            //             );

            //             subMsgs.push(result);
            //           }
            //         }
            //       }

            //       // Check if TriggerMethod tag was present
            //       if (!exifTagPresent) {
            //         console.log(
            //           `No EXIF IMG: ${img}\n${Object.keys(metadata).length}`
            //         );
            //         warningMsgs.noExif.push(
            //           `Set: ${dir.split("SET")[0]} Img: ${imgID.split(".")[0]}`
            //         );
            //       }

            //       // Check if irradiance tags were present
            //       if (irrandianceCounter === 0) {
            //         irradianceMissingFound = true;
            //         const imgID = img.split("_")[1] + "_" + img.split("_")[2];
            //         irradianceMsgs.push(
            //           `Set: ${dir.split("SET")[0]} Img: ${
            //             imgID.split(".")[0]
            //           } has no sun irriadiance data`
            //         );
            //       }
            //     } catch (err) {
            //       console.log(`Catched bad image: ${img}`);
            //       // const imgID = img.split("_")[1] + "_" + img.split("_")[2];
            //       warningMsgs.corrupted.push(
            //         // `Set: ${dir.split("SET")[0]} Img: ${imgID.split(".")[0]}`
            //         pathJs.join(path, dir, subset, img)
            //       );

            //       // continue;
            //     }
            //     let testEnd = performance.now() / 1000;
            //     console.log(
            //       `Time for ${img}: ${(testEnd - testStart).toFixed(2)} `
            //     );
            //   })
            // );

            // for (const img of images) {
            //   let testStart = performance.now() / 1000;
            //   try {
            //     const buffer = await fs2.readFile(
            //       pathJs.join(path, dir, subset, img),
            //       { flag: "r" }
            //     );
            //     const metadata = await exifr.parse(buffer, true);

            //     // if (Object.keys(metadata).length < 60) {
            //     //   console.log(
            //     //     `No EXIF IMG: ${img}\n${Object.keys(metadata).length}`
            //     //   );
            //     //   resultMsg = "no_exif";
            //     //   subMsgs.push(resultMsg);
            //     // }

            //     let irrandianceCounter = 0;
            //     let exifTagPresent = false;

            //     for (const [key, value] of Object.entries(metadata)) {
            //       if (key.includes("Irradiance")) {
            //         irrandianceCounter += 1;
            //       } else if (key.includes("TriggerMethod")) {
            //         // Exif tag "TriggerMethod" found, set flag to true
            //         exifTagPresent = true;

            //         if (value == 0) {
            //           // check if set is complete
            //           const imgID = img.split("_")[1];
            //           const result = await checkCapture(
            //             pathJs.join(path, dir, subset),
            //             imgID,
            //             images
            //           );

            //           subMsgs.push(result);
            //         }
            //       }
            //     }

            //     // Check if TriggerMethod tag was present
            //     if (!exifTagPresent) {
            //       console.log(
            //         `No EXIF IMG: ${img}\n${Object.keys(metadata).length}`
            //       );
            //       warningMsgs.noExif.push(
            //         `Set: ${dir.split("SET")[0]} Img: ${imgID.split(".")[0]}`
            //       );
            //     }

            //     // Check if irradiance tags were present
            //     if (irrandianceCounter === 0) {
            //       irradianceMissingFound = true;
            //       const imgID = img.split("_")[1] + "_" + img.split("_")[2];
            //       irradianceMsgs.push(
            //         `Set: ${dir.split("SET")[0]} Img: ${
            //           imgID.split(".")[0]
            //         } has no sun irriadiance data`
            //       );
            //     }
            //   } catch (err) {
            //     console.log(`Catched bad image: ${img}`);
            //     // const imgID = img.split("_")[1] + "_" + img.split("_")[2];
            //     warningMsgs.corrupted.push(
            //       // `Set: ${dir.split("SET")[0]} Img: ${imgID.split(".")[0]}`
            //       pathJs.join(path, dir, subset, img)
            //     );

            //     continue;
            //   }

            //   let testEnd = performance.now() / 1000;
            //   console.log(
            //     `Time for ${img}: ${(testEnd - testStart).toFixed(2)} `
            //   );
            // }
          }
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

    console.log(`missing found: ${irradianceMissingFound}`);

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
    console.log(`EXCEPTION: ${err}\n${err.stack}`);
    // console.log(`EXCEPTION:`);
    // console.error(err.stack);
    // console.log(err.stack.split("\n"));
    /**
     * Targets results (unexpected)
     */
    const endTime = performance.now() / 1000;
    console.log(`END: ${endTime}`);
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

async function plotMap2(path) {
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

  const setDirectories = await getDirectories(path);

  // Store SETS in array
  for (const dir of setDirectories) {
    if (dir.includes("SET")) {
      const subsetDirectories = await getDirectories(pathJs.join(path, dir));
      for (const subset of subsetDirectories) {
        if (subset.includes("0")) {
          let images = await fs2.readdir(pathJs.join(path, dir, subset));

          // sort array (reading from USB can lead to diff order)
          images.sort();
          const imgPattern = /^IMG_[0-9][0-9][0-9][0-9]_[1-6].tif$/;

          // remove any unintended files
          images = images.filter(
            (item) => item !== "Thumbs.db" && item.match(imgPattern)
          );

          // get unique images capture IDs
          let uniqueCaptures = [
            ...new Set(images.map((item) => item.split("_")[1])),
          ];

          for (const capture of uniqueCaptures) {
            try {
              // Pick any image from the capture for processing
              let img = images.filter(
                (item) => item.split("_")[1] === capture
              )[0];

              const buffer = await fs2.readFile(
                pathJs.join(path, dir, subset, img),
                { flag: "r" }
              );

              const metadata = await exifr.parse(buffer, true);
              let missingGPSImg = false;

              // for (const [key, value] of Object.entries(metadata)) {
              //   if (key === "latitude" || key === "longitude") {
              //     // check if img has GPS tag
              //     if (value == "0") missingGPSImg = true;
              //   }
              // }

              // Check if img has missing gps
              if (metadata.latitude == "0" || metadata.longitude == "0") {
                missingGPS = true;
                console.log(`Skipping IMG: ${img}`);
                break;
              }

              lats.push(metadata.latitude);
              longs.push(metadata.longitude);
            } catch (err) {
              console.log("Catched bad image from PlotMap");
              continue;
            }
          }
        }
      }
    }
  }

  if (longs.length > 0 && lats.length > 0) {
    let gpsObj = { GPSLatitude: lats, GPSLongitude: longs };

    const currentScriptDirectory = __filename;
    console.log(`CURRENT DIR: ${currentScriptDirectory}`);

    // create temp directory
    let TEMP_DIR = pathJs.join(__dirname, "helpers", "temp_files");
    const pathExists = !!(await fs2.stat(TEMP_DIR).catch((e) => false));
    if (!pathExists) {
      await fs2.mkdir(TEMP_DIR);
    }

    try {
      let filename = "FLIGHT_CHECKER_COORDINATES";
      let fileCounter = 1;
      let gpsJSONPath;

      // Export gps coordinates as JSON
      while (true) {
        if (
          !!(await fs2
            .stat(pathJs.join(TEMP_DIR, filename + ".json"))
            .catch((e) => false))
        ) {
          filename = "FLIGHT_CHECKER_COORDINATES_" + fileCounter.toString();
          fileCounter += 1;
        }

        // file doesn't exist
        else {
          await fs2.writeFile(
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
        "helpers",
        "map.R"
      );
      let RExe = pathJs.join(
        currentScriptDirectory,
        "..",
        "..",
        "R",
        "R-4.2.1",
        "bin",
        "Rscript.exe"
      );

      console.log(`R Script: ${RScript}`, "\n", gpsJSONPath, "\n", RExe);

      // Execute R script
      let returnValue;
      await new Promise((resolve, reject) => {
        const RProcess = spawn(RExe, [RScript, gpsJSONPath, "--vanilla"]);
        console.log("Executed");

        RProcess.stdout.on("data", (data) => {
          console.log("R RETURN VALUE: ", data.toString());
          returnValue += data.toString();
          resolve(returnValue);
        });

        RProcess.stderr.on("data", (err) => {
          console.log("Error: " + String(err));
        });

        RProcess.on("close", (code) => {
          console.log("child process exited with code " + code);
        });
      });

      console.log("finished");
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
          console.log(`FILE TO DELETE: ${jsonFile}`);
          await fs2.unlink(jsonFile);
        } catch (err) {
          console.log(`ERROR DELETING FILE: ${err}`);
          continue;
        }
      }

      // Process R output
      if (returnValue.includes("success")) {
        let filenamePoints = returnValue.split("*")[1];
        let filenameLines = returnValue.split("*")[2].slice(0, -3);

        let pointsBuf = await fs2.readFile(
          pathJs.join(TEMP_DIR, filenamePoints)
          // { encoding: "base64" }
        );
        // .toString("base64");
        let linesBuf = await fs2.readFile(
          pathJs.join(TEMP_DIR, filenameLines)
          // { encoding: "base64" }
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
            console.log(`FILE TO DELETE: ${pngFile}`);
            await fs2.unlink(pngFile);
          } catch (err) {
            console.log(`ERROR DELETING FILE: ${err}`);
            continue;
          }
        }

        msgs[0] = [fullPBuffer, fullLBuffer];

        if (missingGPS) result_msg = "success_gps";
        else result_msg = "success";
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

  return msgs;
}

async function validateDir(selectedPaths) {
  // user cancelled popup
  if (selectedPaths.canceled) {
    // signal to enable browse button
    console.log("returning");
    return "enable";
  }

  // user selected a folder ... proceed
  else {
    /**
     * check if directory is valid
     **/
    let imagerySet = [];
    let resultMsg;

    const directories = await getDirectories(selectedPaths.filePaths[0]);

    // Store SETS in array
    for (let set of directories) {
      console.log(`DIR in selected path: ${set}`);
      if (set.includes("SET")) {
        imagerySet.push(set);
      }
    }

    // wrong directory
    if (imagerySet.length === 0) {
      resultMsg = "wrongDir";
    } else {
      resultMsg = "success";
    }

    console.log(performance.now());

    // signal main process for directory validity
    return resultMsg;
  }
}

async function getDirectories(path) {
  let directories = await fs2.readdir(path);

  let filtered = await directories.reduce(async (acc, file) => {
    const fileStats = await fs2.stat(pathJs.join(path, file));

    // return list without file
    if (!Boolean(fileStats.isDirectory())) {
      return acc;
    }

    // Otherwise add this value to the list
    return (await acc).concat(file);
  }, []);

  return filtered;
}

async function checkCapture(path, id, images) {
  let capture = [];
  let resultMsg = "";
  // let images = await fs2.readdir(path);

  // // remove any unintended files
  // const imgPattern = /^IMG_[0-9][0-9][0-9][0-9]_[1-6].tif$/;
  // images = images.filter(
  //   (item) => item !== "Thumbs.db" && item.match(imgPattern)
  // );

  for (const image of images) {
    if (image.includes(id)) {
      capture.push(image);
    }
  }

  if (capture.length === 6) {
    resultMsg = "complete";
  } else {
    resultMsg = "missing";
  }

  return resultMsg;
}

module.exports = {
  detectMissingBands,
  detectMissingTargetsAndIrradiance,
  plotMap2,
  getDirectories,
  validateDir,
};
