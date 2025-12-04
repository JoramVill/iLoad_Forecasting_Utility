"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    runCommand: (command, args) => electron_1.ipcRenderer.invoke('run-command', command, args),
    selectFile: (options) => electron_1.ipcRenderer.invoke('select-file', options),
    selectDirectory: () => electron_1.ipcRenderer.invoke('select-directory'),
    saveFile: (options) => electron_1.ipcRenderer.invoke('save-file', options),
    getAppPath: () => electron_1.ipcRenderer.invoke('get-app-path')
});
