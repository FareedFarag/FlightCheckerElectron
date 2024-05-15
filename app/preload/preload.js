"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const API = {
  browseFolder: () => {
    return ipcRenderer.invoke("browseFolder", "");
  },
  backendFunc: (func) => {
    return ipcRenderer.invoke("processing", func);
  },
  openFile: (path) => {
    return ipcRenderer.invoke("openFile", path);
  },
  externalDoc: () => {
    return ipcRenderer.invoke("externalDoc");
  },
};

contextBridge.exposeInMainWorld("api", API);
