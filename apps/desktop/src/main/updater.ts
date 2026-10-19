// Обновление приложения из GitHub Releases.
// - Windows-установщик (NSIS): electron-updater сам качает новую версию в фоне,
//   ставит при перезапуске (кнопка в баннере) или при обычном выходе из игры.
// - macOS (без платной подписи Apple автообновление невозможно) и portable-версия Windows:
//   проверяем последний релиз через GitHub API и показываем «Скачать» со ссылкой.
import type { UpdateStatus } from '../shared/api';
import { RELEASES } from '../shared/api';

export type UpdateMode = 'auto' | 'manual' | 'off';

const FIRST_CHECK_DELAY_MS = 5_000;
const CHECK_INTERVAL_MS = 30 * 60_000;

/** Сравнение версий вида 1.2.3 (префикс v допускается). >0 — a новее b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Каким способом обновляться на этой установке. */
export function updateMode(opts: {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  env: NodeJS.ProcessEnv;
}): UpdateMode {
  // В dev и e2e не ходим в сеть; TWODOTS_UPDATE_CHECK=1 — ручная проверка уведомления.
  if (!opts.isPackaged) return opts.env.TWODOTS_UPDATE_CHECK === '1' ? 'manual' : 'off';
  if (opts.platform === 'win32') {
    // electron-builder ставит PORTABLE_EXECUTABLE_DIR только portable-версии.
    return opts.env.PORTABLE_EXECUTABLE_DIR ? 'manual' : 'auto';
  }
  return opts.platform === 'darwin' ? 'manual' : 'off';
}

/** Версия последнего релиза из ответа GitHub API (tag_name вида v0.3.0). */
export function latestVersionFrom(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const tag = (json as { tag_name?: unknown }).tag_name;
  return typeof tag === 'string' && /^v?\d+\.\d+\.\d+/.test(tag) ? tag.replace(/^v/, '') : null;
}

export async function fetchLatestVersion(): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': '2Dots' } },
  );
  if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
  return latestVersionFrom(await res.json());
}

/** То, что нужно от electron-updater (для тестов подменяется). */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'update-available', cb: (info: { version: string }) => void): unknown;
  on(event: 'download-progress', cb: (p: { percent: number }) => void): unknown;
  on(event: 'update-downloaded', cb: (info: { version: string }) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdaterDeps {
  mode: UpdateMode;
  currentVersion: string;
  /** Нужен только в режиме auto. */
  autoUpdater?: AutoUpdaterLike;
  fetchLatest(): Promise<string | null>;
  /** Новое состояние — всем окнам. */
  broadcast(status: UpdateStatus): void;
  log(message: string, err?: unknown): void;
}

export class Updater {
  private status: UpdateStatus = { state: 'idle' };
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly deps: UpdaterDeps) {
    const au = deps.autoUpdater;
    if (deps.mode !== 'auto' || !au) return;
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 }),
    );
    au.on('download-progress', (p) => {
      if (this.status.state === 'downloading') {
        this.set({ ...this.status, percent: Math.round(p.percent) });
      }
    });
    au.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version }));
    au.on('error', (err) => {
      deps.log('ошибка автообновления', err);
      // Нет сети и т. п. — не пугаем; ошибку показываем, только если обрыв посреди загрузки.
      if (this.status.state === 'downloading') {
        this.set({ state: 'error', message: 'Не удалось скачать обновление' });
      }
    });
  }

  get current(): UpdateStatus {
    return this.status;
  }

  /** Первая проверка через несколько секунд после запуска, затем раз в 30 минут. */
  start(): void {
    if (this.deps.mode === 'off') return;
    this.timers.push(setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS));
    this.timers.push(setInterval(() => void this.check(), CHECK_INTERVAL_MS));
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  async check(): Promise<void> {
    // Уже качаем или скачали — повторно не проверяем.
    if (this.status.state === 'downloading' || this.status.state === 'ready') return;
    try {
      if (this.deps.mode === 'auto') {
        await this.deps.autoUpdater?.checkForUpdates();
      } else if (this.deps.mode === 'manual') {
        const latest = await this.deps.fetchLatest();
        if (latest && compareVersions(latest, this.deps.currentVersion) > 0) {
          this.set({ state: 'available', version: latest, mode: 'manual' });
        }
      }
    } catch (err) {
      this.deps.log('проверка обновлений', err);
    }
  }

  /** Перезапуск с установкой — только когда обновление скачано. */
  install(): boolean {
    if (this.deps.mode !== 'auto' || this.status.state !== 'ready') return false;
    this.deps.autoUpdater?.quitAndInstall(true, true);
    return true;
  }

  private set(status: UpdateStatus): void {
    this.status = status;
    this.deps.broadcast(status);
  }
}
