import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
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
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    const devPort = process.env.VITE_PORT || '5173'
    mainWindow.loadURL(`http://localhost:${devPort}`)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC Handlers

// Run CLI command
ipcMain.handle('run-command', async (_event, command: string, args: string[]) => {
  return new Promise((resolve) => {
    // Get the path to the CLI
    const cliPath = path.join(app.getAppPath(), '..', 'dist', 'index.js')
    const nodeArgs = [cliPath, ...args]

    const child = spawn('node', nodeArgs, {
      cwd: path.join(app.getAppPath(), '..'),
      shell: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 })
    })

    child.on('error', (error) => {
      resolve({ stdout, stderr: error.message, code: 1 })
    })
  })
})

// Select file
ipcMain.handle('select-file', async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

// Select directory
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// Save file dialog
ipcMain.handle('save-file', async (_event, options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options?.defaultPath,
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
  })
  return result.canceled ? null : result.filePath
})

// Get app path
ipcMain.handle('get-app-path', () => {
  return app.getAppPath()
})
