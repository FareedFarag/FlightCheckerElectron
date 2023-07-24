"use strict";

const fs = require("fs");
const fs2 = require("fs").promises;
const pathJs = require("path");
const exifr = require("exifr");
const { performance } = require("perf_hooks");
const PromiseBB = require("bluebird");

async function promise() {
  const path = "G:\\tests\\no_gps+no_irradiance\\0000SET\\000";
  let promises = [];

  let images = await fs.promises.readdir(path);
  // sort array (reading from USB can lead to diff order)
  images.sort();
  const imgPattern = /^IMG_[0-9][0-9][0-9][0-9]_[1-6].tif$/;

  // remove any unintended files
  images = images.filter((item) => item.match(imgPattern));

  images.forEach((img) => {
    const promise = new Promise((resolve, reject) => {
      fs.readFile(
        pathJs.join(path, img),
        {
          flag: "r",
        },
        (err, data) => {
          resolve(exifr.parse(data, true));
        }
      );
    });

    promises.push(promise);
  });

  // return Promise.all(promises);
  return PromiseBB.map(promises, (p) => p, { concurrency: 100 });
}

async function doWork() {
  const startTime = performance.now() / 1000;
  const response = await promise();
  const endTime = performance.now() / 1000;

  console.log(response);
  console.log((endTime - startTime).toFixed(2));
}

doWork();