"use strict";

const pathJs = require("path");
const fs = require("fs");

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

    // signal main process for directory validity
    return resultMsg;
  }
}

async function getDirectories(path) {
  let directories = await fs.promises.readdir(path);

  let filtered = directories.reduce(async (acc, file) => {
    const fileStats = await fs.promises.stat(pathJs.join(path, file));

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
  validateDir,
  getDirectories,
  checkCapture,
};
