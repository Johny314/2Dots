// Контракт моста preload → renderer (window.api). Меняется только отдельной задачей.

export interface HostInfo {
  port: number;
  /** Локальные IPv4-адреса (без 127.* и 169.254.*), которые показываем второму игроку. */
  ips: string[];
}

export interface DiscoveredHost {
  name: string;
  ip: string;
  port: number;
}

/**
 * Состояние обновления приложения.
 * - auto: Windows-установщик — новая версия качается сама и ставится при перезапуске;
 * - manual: Mac и portable-версия — только уведомление со ссылкой на страницу релиза.
 */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'available'; version: string; mode: 'manual' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface DesktopApi {
  /** name — имя игрока: под ним хост виден в поиске по сети (mDNS). */
  hostStart(name: string): Promise<HostInfo>;
  hostStop(): Promise<void>;
  discoverHosts(): Promise<DiscoveredHost[]>;
  getVersion(): string;
  /** Подписка на состояние обновления; сразу вызывает handler с текущим. Возвращает отписку. */
  onUpdate(handler: (status: UpdateStatus) => void): () => void;
  /** Перезапустить приложение и установить скачанное обновление (state: 'ready'). */
  installUpdate(): void;
  /** Открыть страницу последнего релиза в браузере (state: 'available'). */
  openReleasePage(): void;
}

export const IPC = {
  hostStart: 'host:start',
  hostStop: 'host:stop',
  discoverHosts: 'host:discover',
  getVersion: 'app:version',
  updateStatus: 'update:status',
  updateGet: 'update:get',
  updateInstall: 'update:install',
  updateOpenRelease: 'update:open-release',
} as const;

/** Репозиторий с релизами (публичный) — источник обновлений. */
export const RELEASES = { owner: 'Johny314', repo: '2Dots' } as const;
export const RELEASES_URL = `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/latest`;
