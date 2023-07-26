"use strict";

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  electron,
  dialog,
  shell,
} = require("electron");

const pathJs = require("path");
const fs2 = require("fs").promises;
const { performance } = require("perf_hooks");
const exifr = require("exifr");

// import backend functions
const backendFuncs = require("../../src/js/backend");
const helpers = require("../../src/js/helpers");

let mainWindow;
var imageryPath = "";

process.on("uncaughtException", (error) => {
  console.error(error);

  // terminate JS
  process.exit(1);
});

// Allow only one instance of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 1000,
    autoHideMenuBar: true,
    frame: true,
    show: true,
    resizable: true,
    webPreferences: {
      preload: pathJs.join(__dirname, "../preload/preload.js"),
      devTools: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });
  mainWindow.loadFile(pathJs.join(__dirname, "../../src/html", "index.html"));
  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  return mainWindow;
}

app.on("ready", () => {
  const win = createWindow();
  // win.maximize();
  // win.show;
  win.webContents.openDevTools();
});

app.on("window-all-closed", function () {
  app.quit();
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle user directory selection
ipcMain.handle("browseFolder", async (event, data) => {
  console.log("Main.js received browseFolder Signal");
  imageryPath = "";

  const selectedPaths = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  console.log(selectedPaths);

  // set global variable: imageryPath
  const resultMsg = await helpers.validateDir(selectedPaths);
  if (resultMsg === "success") imageryPath = selectedPaths.filePaths[0];

  return resultMsg;
});

// Handle backend functions
ipcMain.handle("processing", async (event, data) => {
  console.log("Main.js received processing Signal");

  if (data == "read") {
    return await backendFuncs.getImages(imageryPath);
  } else if (data == "bands") {
    return await backendFuncs.detectMissingBands();
  } else if (data == "exif") {
    return await backendFuncs.detectMissingTargetsAndIrradiance(imageryPath);
  } else if (data == "plot") {
    return await backendFuncs.plotMap();
  }
});

// Handle open file
ipcMain.handle("openFile", (event, data) => {
  try {
    shell.showItemInFolder(data);
    return 1;
  } catch (err) {
    console.log(`View file error catched: ${err}`);
    return 0;
  }
});
