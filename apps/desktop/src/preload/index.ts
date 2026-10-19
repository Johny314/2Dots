import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type DesktopApi, type UpdateStatus } from '../shared/api';

const api: DesktopApi = {
  hostStart: (name) => ipcRenderer.invoke(IPC.hostStart, name),
  hostStop: () => ipcRenderer.invoke(IPC.hostStop),
  discoverHosts: () => ipcRenderer.invoke(IPC.discoverHosts),
  getVersion: () => ipcRenderer.sendSync(IPC.getVersion) as string,
  onUpdate: (handler) => {
    const listener = (_event: unknown, status: UpdateStatus) => handler(status);
    ipcRenderer.on(IPC.updateStatus, listener);
    void ipcRenderer.invoke(IPC.updateGet).then((status: UpdateStatus) => handler(status));
    return () => ipcRenderer.off(IPC.updateStatus, listener);
  },
  installUpdate: () => ipcRenderer.send(IPC.updateInstall),
  openReleasePage: () => ipcRenderer.send(IPC.updateOpenRelease),
};

contextBridge.exposeInMainWorld('api', api);
