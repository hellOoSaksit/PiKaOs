import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
