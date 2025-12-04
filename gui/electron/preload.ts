import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (command: string, args: string[]) =>
    ipcRenderer.invoke('run-command', command, args),

  selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('select-file', options),

  selectDirectory: () =>
    ipcRenderer.invoke('select-directory'),

  saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('save-file', options),

  getAppPath: () =>
    ipcRenderer.invoke('get-app-path')
})
