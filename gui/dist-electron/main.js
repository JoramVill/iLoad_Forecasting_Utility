"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '../public/icon.png')
    });
    // In development, load from Vite dev server
    if (process.env.NODE_ENV === 'development') {
        const devPort = process.env.VITE_PORT || '5173';
        mainWindow.loadURL(`http://localhost:${devPort}`);
        mainWindow.webContents.openDevTools();
    }
    else {
        // In production, load the built files
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
// IPC Handlers
// Run CLI command
electron_1.ipcMain.handle('run-command', async (_event, command, args) => {
    return new Promise((resolve) => {
        // Get the path to the CLI
        const cliPath = path.join(electron_1.app.getAppPath(), '..', 'dist', 'index.js');
        const nodeArgs = [cliPath, ...args];
        const child = (0, child_process_1.spawn)('node', nodeArgs, {
            cwd: path.join(electron_1.app.getAppPath(), '..'),
            shell: true
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            resolve({ stdout, stderr, code: code ?? 0 });
        });
        child.on('error', (error) => {
            resolve({ stdout, stderr: error.message, code: 1 });
        });
    });
});
// Select file
electron_1.ipcMain.handle('select-file', async (_event, options) => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result.canceled ? null : result.filePaths[0];
});
// Select directory
electron_1.ipcMain.handle('select-directory', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});
// Save file dialog
electron_1.ipcMain.handle('save-file', async (_event, options) => {
    const result = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath: options?.defaultPath,
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result.canceled ? null : result.filePath;
});
// Get app path
electron_1.ipcMain.handle('get-app-path', () => {
    return electron_1.app.getAppPath();
});
