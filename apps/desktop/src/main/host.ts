// Хост игры в main-процессе: ws-сервер + mDNS-публикация, поиск хостов, локальные IPv4.
import { hostname, networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { DEFAULT_PORT } from '@2dots/core';
import { findHosts, publishHost, startHostServer, type HostServerHandle } from '@2dots/net';
import type { DiscoveredHost, HostInfo } from '../shared/api';

const DISCOVERY_TIMEOUT_MS = 2000;

// Виртуальные адаптеры (VPN, Hyper-V, VirtualBox, Docker…) — в конец списка: второму игроку они не нужны.
const VIRTUAL_IFACE =
  /^(utun|tun|tap|bridge|vmnet|vbox|veth|docker|br-|awdl|llw|zt)|vethernet|virtual|vmware|hyper-v|loopback|wsl/i;

type Interfaces = ReturnType<typeof networkInterfaces>;

function isIPv4(info: NetworkInterfaceInfo): boolean {
  // В разных версиях Node family бывает строкой 'IPv4' или числом 4.
  return info.family === 'IPv4' || (info.family as unknown) === 4;
}

/** Локальные IPv4-адреса для показа второму игроку: без 127.* и 169.254.*, реальные адаптеры первыми. */
export function localIPv4s(interfaces: Interfaces = networkInterfaces()): string[] {
  const found: { ip: string; virtual: boolean }[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (!isIPv4(info) || info.internal) continue;
      if (info.address.startsWith('127.') || info.address.startsWith('169.254.')) continue;
      found.push({ ip: info.address, virtual: VIRTUAL_IFACE.test(name) });
    }
  }
  // Array.prototype.sort стабилен: внутри групп сохраняется порядок ОС.
  found.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  return [...new Set(found.map((f) => f.ip))];
}

function hostDisplayName(): string {
  return hostname().replace(/\.local\.?$/i, '') || '2Dots';
}

/** TWODOTS_PORT — порт хоста для тестов (0 — случайный, два экземпляра на одной машине). */
export function configuredPort(raw: string | undefined = process.env.TWODOTS_PORT): number {
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 0 && port < 65536 ? port : DEFAULT_PORT;
}

/** Зависимости хоста — подменяются в unit-тестах. */
export interface HostDeps {
  startHostServer: typeof startHostServer;
  publishHost: typeof publishHost;
  findHosts: typeof findHosts;
  localIPv4s: () => string[];
  displayName: () => string;
  port: () => number;
  warn: (message: string, err: unknown) => void;
}

export interface HostController {
  hostStart(): Promise<HostInfo>;
  hostStop(): Promise<void>;
  discoverHosts(): Promise<DiscoveredHost[]>;
  isHosting(): boolean;
}

interface RunningHost {
  server: HostServerHandle;
  unpublish: (() => void) | null;
}

export function createHostController(deps: HostDeps): HostController {
  let running: RunningHost | null = null;
  let starting: Promise<RunningHost> | null = null;
  let stopping: Promise<void> | null = null;
  // Растёт при каждом hostStop: hostStart, начатый до остановки, не должен вернуть адрес мёртвого сервера.
  let generation = 0;

  async function launch(): Promise<RunningHost> {
    const server = await deps.startHostServer({ port: deps.port() });
    let unpublish: (() => void) | null = null;
    try {
      unpublish = deps.publishHost(deps.displayName(), server.port);
    } catch (err) {
      // mDNS опционален: без него второй игрок вводит IP вручную.
      deps.warn('[2dots] mDNS-публикация не удалась:', err);
    }
    return { server, unpublish };
  }

  async function shutdown(host: RunningHost): Promise<void> {
    try {
      host.unpublish?.();
    } catch (err) {
      deps.warn('[2dots] отмена mDNS-публикации не удалась:', err);
    }
    await host.server.stop();
  }

  async function doStop(): Promise<void> {
    if (starting) {
      try {
        await starting;
      } catch {
        // запуск не удался — останавливать нечего
      }
    }
    const current = running;
    running = null;
    if (current) await shutdown(current);
  }

  async function hostStart(): Promise<HostInfo> {
    const gen = generation;
    // Старт сразу после стопа ждёт, пока старый сервер освободит порт.
    while (stopping) await stopping.catch(() => undefined);
    if (gen !== generation) throw new Error('хост остановлен во время запуска');
    if (!running) {
      starting ??= launch()
        .then((host) => (running = host))
        .finally(() => {
          starting = null;
        });
      const launched = await starting;
      if (gen !== generation) {
        // hostStop вызван, пока шёл запуск: адрес мёртвого сервера не отдаём. Если тот hostStop
        // почему-то не забрал этот сервер — останавливаем его сами.
        if (running === launched && !stopping) {
          running = null;
          await shutdown(launched);
        }
        throw new Error('хост остановлен во время запуска');
      }
    }
    const host = running;
    if (!host) throw new Error('хост остановлен во время запуска');
    return { port: host.server.port, ips: deps.localIPv4s() };
  }

  /** Останавливает хост, если он запущен. Безопасно вызывать многократно и во время запуска. */
  function hostStop(): Promise<void> {
    generation++;
    if (!stopping) {
      stopping = doStop().finally(() => {
        stopping = null;
      });
    }
    return stopping;
  }

  async function discoverHosts(): Promise<DiscoveredHost[]> {
    try {
      return await deps.findHosts(DISCOVERY_TIMEOUT_MS);
    } catch (err) {
      // Ошибки mDNS не пробрасываются — остаётся ручной ввод IP.
      deps.warn('[2dots] поиск хостов не удался:', err);
      return [];
    }
  }

  return {
    hostStart,
    hostStop,
    discoverHosts,
    isHosting: () => running !== null || starting !== null || stopping !== null,
  };
}

export const { hostStart, hostStop, discoverHosts, isHosting } = createHostController({
  startHostServer,
  publishHost,
  findHosts,
  localIPv4s: () => localIPv4s(),
  displayName: hostDisplayName,
  port: () => configuredPort(),
  warn: (message, err) => console.warn(message, err),
});
