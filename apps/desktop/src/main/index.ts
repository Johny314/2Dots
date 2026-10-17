import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { IPC } from '../shared/api';

// Важно: без requestSingleInstanceLock — для тестов запускаются два экземпляра.

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    title: '2Dots',
    backgroundColor: '#0e0f1a',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());

  // TWODOTS_MODE=mock|local — режим отладки renderer (см. CLAUDE.md).
  const mode = process.env.TWODOTS_MODE;
  const query: Record<string, string> = mode ? { [mode]: '1' } : {};
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    void win.loadURL(url.toString());
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'), { query });
  }
}

function registerIpc(): void {
  ipcMain.on(IPC.getVersion, (event) => {
    event.returnValue = app.getVersion();
  });
  // Трек C: hostStart / hostStop / discoverHosts.
  const notImplemented = async () => {
    throw new Error('не реализовано (трек C)');
  };
  ipcMain.handle(IPC.hostStart, notImplemented);
  ipcMain.handle(IPC.hostStop, notImplemented);
  ipcMain.handle(IPC.discoverHosts, notImplemented);
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
