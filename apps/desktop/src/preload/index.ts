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

const online = {
  connect: () => ipcRenderer.invoke('online.connect'),
  send: (message: unknown) => ipcRenderer.invoke('online.send', message),
  onMessage: (listener: (message: unknown) => void) => {
    const receive = (_event: IpcRendererEvent, message: unknown) => listener(message)
    ipcRenderer.on('online.message', receive)
    return () => ipcRenderer.removeListener('online.message', receive)
  },
  get: (key: string) => ipcRenderer.invoke('online.get', key),
  set: (key: string, value: unknown) => ipcRenderer.invoke('online.set', key, value),
  entries: (prefix: string) => ipcRenderer.invoke('online.entries', prefix),
  personas: () => ipcRenderer.invoke('online.personas'),
  provideAgent: (input: unknown) => ipcRenderer.invoke('online.agent', input),
  coach: (view: unknown, question?: string) => ipcRenderer.invoke('online.coach', view, question)
}
contextBridge.exposeInMainWorld('riverOnline', online)
