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
    tools: (id: string) => ipcRenderer.invoke('mcp:tools', id),
    callTool: (id: string, name: string, args: Record<string, unknown>) => ipcRenderer.invoke('mcp:callTool', id, name, args),
  },
  secrets: {
    setForServer: (sid: string, key: string, value: string) => ipcRenderer.invoke('secrets:setForServer', sid, key, value),
  },
  ai: {
    setKey: (provider: string, apiKey: string) => ipcRenderer.invoke('ai:setKey', { provider, apiKey }),
    clearKey: (provider: string) => ipcRenderer.invoke('ai:clearKey', { provider }),
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (c: any) => ipcRenderer.invoke('ai:setConfig', c),
    chat: (messages: Array<{ role: string; content: string }>) => ipcRenderer.invoke('ai:chat', { messages }),
    stop: () => ipcRenderer.invoke('ai:stop'),
    onEvent: (cb: (ev: any) => void) => {
      const listener = (_e: unknown, ev: any) => cb(ev)
      ipcRenderer.on('ai:event', listener)
      return () => ipcRenderer.removeListener('ai:event', listener)
    },
  },
  recovery: {
    diagnose: () => ipcRenderer.invoke('recovery:diagnose'),
    repair: (id: string, subId?: string) => ipcRenderer.invoke('recovery:repair', id, subId),
    clear: (id: string) => ipcRenderer.invoke('recovery:clear', id),
    clearCache: () => ipcRenderer.invoke('recovery:clearCache'),
  },
  window: {
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    getBounds: () => ipcRenderer.invoke('window:getBounds'),
    move: (x: number, y: number) => ipcRenderer.send('window:move', x, y),
    setTitleBarOverlay: (colors: { color: string; symbolColor: string; bg?: string }) =>
      ipcRenderer.invoke('window:setTitleBarOverlay', colors),
    quit: () => ipcRenderer.invoke('window:quit'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'),
    zoom: (dir: 'in' | 'out' | 'reset') => ipcRenderer.invoke('window:zoom', dir),
    onMaximizedChanged: (cb: (v: boolean) => void) => {
      const listener = (_e: unknown, v: boolean) => cb(v)
      ipcRenderer.on('window:maximizedChanged', listener)
      return () => ipcRenderer.removeListener('window:maximizedChanged', listener)
    },
  },
}

export type PikaosDesktopApi = typeof api

contextBridge.exposeInMainWorld('pikaosDesktop', api)
