import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { RiverApi } from '../shared/types'

const api: RiverApi = {
  invoke: (cmd, ...args) => ipcRenderer.invoke(cmd, ...args),
  on: (event, cb) => {
    const listener = (_e: IpcRendererEvent, payload: Parameters<typeof cb>[0]) => cb(payload)
    ipcRenderer.on(event, listener)
    return () => void ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('river', api)
