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

async function backendWrapper(userPath) {
  // get all image files and metadata
  const imageContainer = await getImages(userPath);

  // Send
}

async function getImages(userPath) {
  // Store SETS in array
  const setPattern = /^[0-9][0-9][0-9][0-9]SET$/;
  let setDirectories = await helpers.getDirectories(userPath);
  setDirectories = setDirectories.filter((item) => item.match(setPattern));

  // JSON to store image paths and metadata
  let imageContainer = {};

  // Iterate through each SET
  for (const SET of setDirectories) {
    // create keys in image container
    imageContainer[SET] = {};
    imageContainer[SET]["images"] = [];
    imageContainer[SET]["metadata"] = [];

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
      let subsetImages = await fs.promises.readdir(
        pathJs.join(userPath, SET, subset)
      );
      subsetImages = subsetImages.filter((item) => item.match(imgPattern));
      subsetImages.sort();

      // create promises to read image files and their metadata
      let promises = [];
      subsetImages.forEach((img) => {
        const promise = new Promise((resolve, reject) => {
          fs.readFile(
            pathJs.join(userPath, SET, subset, img),
            {
              flag: "r",
            },
            (err, data) => {
              if (err) resolve({});
              else {
                exifr
                  .parse(data, true)
                  .then((metadata) => resolve(metadata))
                  .catch((err) => resolve({}));
              }
            }
          );
        });

        promises.push(promise);
      });

      // resolve all promises and retrieve images' metadata
      const metadata = await PromiseBB.map(promises, (p) => p, {
        concurrency: 400,
      });

      // store results
      imageContainer[SET]["images"] =
        imageContainer[SET]["images"].concat(subsetImages);
      imageContainer[SET]["metadata"] =
        imageContainer[SET]["metadata"].concat(metadata);
    }
  }

  return imageContainer;
}

async function test() {
  const result = await getImages("G:\\tests\\missing_bands");
  //   console.log(result);
  console.log(result["0000SET"]["images"][1199]);
  //   console.log(result["0000SET"]["metadata"][0]);
}

// test();
