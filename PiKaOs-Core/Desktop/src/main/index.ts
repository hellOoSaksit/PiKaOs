import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerAppProtocol } from './protocol'
import { createWindow } from './window'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// Prod: Frontend/dist is copied into app resources via electron-builder's extraResources
// (electron-builder.yml: `../Frontend/dist` -> `frontend`). Dev: the renderer comes from the
// Vite dev server (VITE_DEV_SERVER_URL) instead, but a sane on-disk path is still passed in
// so the app:// handler never resolves to an undefined directory.
const distDir = app.isPackaged
  ? join(process.resourcesPath, 'frontend')
  : join(__dirname, '../../../Frontend/dist')

app.whenReady().then(() => {
  registerAppProtocol(distDir)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
