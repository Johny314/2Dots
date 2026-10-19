import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { join } from 'node:path';
import { IPC, RELEASES_URL, type UpdateStatus } from '../shared/api';
import { discoverHosts, hostStart, hostStop, isHosting } from './host';
import { fetchLatestVersion, Updater, updateMode } from './updater';

const updatesMode = updateMode({
  platform: process.platform,
  isPackaged: app.isPackaged,
  env: process.env,
});
const updater = new Updater({
  mode: updatesMode,
  currentVersion: __APP_VERSION__,
  // electron-updater трогаем только в режиме auto: в dev он ругается на отсутствие app-update.yml.
  autoUpdater: updatesMode === 'auto' ? electronUpdater.autoUpdater : undefined,
  fetchLatest: fetchLatestVersion,
  broadcast: (status: UpdateStatus) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateStatus, status);
  },
  log: (message, err) => console.warn(`[2dots] ${message}:`, err),
});

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

  // Renderer не открывает новых окон и не уходит со своей страницы (CSP — в renderer/index.html).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  // TWODOTS_MODE=mock|local — режим отладки renderer (см. CLAUDE.md).
  const mode = process.env.TWODOTS_MODE;
  const query: Record<string, string> = mode ? { [mode]: '1' } : {};
  // TWODOTS_E2E=1 — тестовые хуки renderer (window.__twodots, в т.ч. autoplay), только для e2e.
  // В упакованном приложении не включаются: иначе autoplay стал бы доступным читом.
  if (process.env.TWODOTS_E2E === '1' && !app.isPackaged) query.e2e = '1';
  // TWODOTS_MOCK_UPDATE=ready|available — баннер обновления в режиме mock (только dev/e2e).
  const mockUpdate = process.env.TWODOTS_MOCK_UPDATE;
  if (mode === 'mock' && mockUpdate && !app.isPackaged) query.update = mockUpdate;
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
    event.returnValue = __APP_VERSION__;
  });
  ipcMain.handle(IPC.hostStart, (_event, name: unknown) =>
    hostStart(typeof name === 'string' ? name : ''),
  );
  ipcMain.handle(IPC.hostStop, () => hostStop());
  ipcMain.handle(IPC.discoverHosts, () => discoverHosts());
  ipcMain.handle(IPC.updateGet, () => updater.current);
  ipcMain.on(IPC.updateInstall, () => {
    updater.install();
  });
  // Адрес фиксированный — renderer не может открыть произвольную ссылку.
  ipcMain.on(IPC.updateOpenRelease, () => void shell.openExternal(RELEASES_URL));
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  updater.start();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// На выходе останавливаем сервер и снимаем mDNS-публикацию, затем выходим по-настоящему.
// before-quit, а не will-quit: повторный app.quit() после preventDefault в will-quit на macOS не срабатывает.
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !isHosting()) return;
  event.preventDefault();
  quitting = true;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  void Promise.race([hostStop(), timeout])
    .catch((err: unknown) => console.warn('[2dots] остановка хоста при выходе:', err))
    .finally(() => app.quit());
});
