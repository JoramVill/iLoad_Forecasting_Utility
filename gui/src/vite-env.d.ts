/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electronAPI: {
    runCommand: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
    selectDirectory: () => Promise<string | null>;
    saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
    getAppPath: () => Promise<string>;
  }
}
