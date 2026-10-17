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

export interface DesktopApi {
  hostStart(): Promise<HostInfo>;
  hostStop(): Promise<void>;
  discoverHosts(): Promise<DiscoveredHost[]>;
  getVersion(): string;
}

export const IPC = {
  hostStart: 'host:start',
  hostStop: 'host:stop',
  discoverHosts: 'host:discover',
  getVersion: 'app:version',
} as const;
