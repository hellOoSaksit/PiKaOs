import { contextBridge, ipcRenderer } from 'electron'

// Locked bridge shape (Task 10 spec) — every call delegates straight through to a guarded
// ipcMain.handle in src/main/ipc.ts. No logic lives here; the renderer never touches Node/fs
// directly, only this narrow surface.
const api = {
  isDesktop: true as const,
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (c: any) => ipcRenderer.invoke('config:set', c),
  },
  auth: {
    login: (u: string, p: string) => ipcRenderer.invoke('auth:login', u, p),
    getAccessToken: () => ipcRenderer.invoke('auth:getAccessToken'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    add: (d: any) => ipcRenderer.invoke('mcp:add', d),
    remove: (id: string) => ipcRenderer.invoke('mcp:remove', id),
    start: (id: string) => ipcRenderer.invoke('mcp:start', id),
    stop: (id: string) => ipcRenderer.invoke('mcp:stop', id),
    statuses: () => ipcRenderer.invoke('mcp:statuses'),
    onStatus: (cb: (id: string, s: string) => void) => ipcRenderer.on('mcp:status', (_e, id, s) => cb(id, s)),
  },
  secrets: {
    setForServer: (sid: string, key: string, value: string) => ipcRenderer.invoke('secrets:setForServer', sid, key, value),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    getBounds: () => ipcRenderer.invoke('window:getBounds'),
    move: (x: number, y: number) => ipcRenderer.send('window:move', x, y),
    onMaximizedChanged: (cb: (v: boolean) => void) => {
      const listener = (_e: unknown, v: boolean) => cb(v)
      ipcRenderer.on('window:maximizedChanged', listener)
      return () => ipcRenderer.removeListener('window:maximizedChanged', listener)
    },
  },
}

export type PikaosDesktopApi = typeof api

contextBridge.exposeInMainWorld('pikaosDesktop', api)
