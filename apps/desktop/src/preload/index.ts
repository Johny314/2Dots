import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type DesktopApi } from '../shared/api';

const api: DesktopApi = {
  hostStart: (name) => ipcRenderer.invoke(IPC.hostStart, name),
  hostStop: () => ipcRenderer.invoke(IPC.hostStop),
  discoverHosts: () => ipcRenderer.invoke(IPC.discoverHosts),
  getVersion: () => ipcRenderer.sendSync(IPC.getVersion) as string,
};

contextBridge.exposeInMainWorld('api', api);
