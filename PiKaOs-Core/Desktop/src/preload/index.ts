import { contextBridge } from 'electron'

// bridge added in Task 10
contextBridge.exposeInMainWorld('pikaosDesktop', { isDesktop: true })
