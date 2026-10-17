// Хост игры в main-процессе: ws-сервер + mDNS-публикация, поиск хостов, локальные IPv4.
import { hostname, networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { DEFAULT_PORT } from '@2dots/core';
import { findHosts, publishHost, startHostServer, type HostServerHandle } from '@2dots/net';
import type { DiscoveredHost, HostInfo } from '../shared/api';

const DISCOVERY_TIMEOUT_MS = 2000;

// Виртуальные адаптеры (VPN, Hyper-V, VirtualBox, Docker…) — в конец списка: второму игроку они не нужны.
const VIRTUAL_IFACE =
  /^(utun|tun|tap|bridge|vmnet|vbox|veth|docker|br-|awdl|llw|zt)|vethernet|virtual|vmware|hyper-v|loopback|wsl/i;

function isIPv4(info: NetworkInterfaceInfo): boolean {
  // В разных версиях Node family бывает строкой 'IPv4' или числом 4.
  return info.family === 'IPv4' || (info.family as unknown) === 4;
}

/** Локальные IPv4-адреса для показа второму игроку: без 127.* и 169.254.*, реальные адаптеры первыми. */
export function localIPv4s(): string[] {
  const found: { ip: string; virtual: boolean }[] = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (!isIPv4(info) || info.internal) continue;
      if (info.address.startsWith('127.') || info.address.startsWith('169.254.')) continue;
      found.push({ ip: info.address, virtual: VIRTUAL_IFACE.test(name) });
    }
  }
  found.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  return [...new Set(found.map((f) => f.ip))];
}

function hostDisplayName(): string {
  return hostname().replace(/\.local\.?$/i, '') || '2Dots';
}

function configuredPort(): number {
  // TWODOTS_PORT — для тестов (два экземпляра на одной машине); по умолчанию DEFAULT_PORT.
  const raw = process.env.TWODOTS_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 0 && port < 65536 ? port : DEFAULT_PORT;
}

interface RunningHost {
  server: HostServerHandle;
  unpublish: (() => void) | null;
}

let running: RunningHost | null = null;
let starting: Promise<RunningHost> | null = null;

async function launch(): Promise<RunningHost> {
  const server = await startHostServer({ port: configuredPort() });
  let unpublish: (() => void) | null = null;
  try {
    unpublish = publishHost(hostDisplayName(), server.port);
  } catch (err) {
    // mDNS опционален: без него второй игрок вводит IP вручную.
    console.warn('[2dots] mDNS-публикация не удалась:', err);
  }
  return { server, unpublish };
}

/** Поднимает хост (повторный вызов возвращает уже запущенный). */
export async function hostStart(): Promise<HostInfo> {
  if (!running) {
    starting ??= launch().finally(() => {
      starting = null;
    });
    running = await starting;
  }
  return { port: running.server.port, ips: localIPv4s() };
}

/** Останавливает хост, если он запущен. Безопасно вызывать многократно. */
export async function hostStop(): Promise<void> {
  if (starting) {
    try {
      await starting;
    } catch {
      // запуск не удался — останавливать нечего
    }
  }
  const current = running;
  running = null;
  if (!current) return;
  try {
    current.unpublish?.();
  } catch (err) {
    console.warn('[2dots] отмена mDNS-публикации не удалась:', err);
  }
  await current.server.stop();
}

export function isHosting(): boolean {
  return running !== null || starting !== null;
}

/** Ищет хосты в сети. Ошибки mDNS не пробрасываются — остаётся ручной ввод IP. */
export async function discoverHosts(): Promise<DiscoveredHost[]> {
  try {
    return await findHosts(DISCOVERY_TIMEOUT_MS);
  } catch (err) {
    console.warn('[2dots] поиск хостов не удался:', err);
    return [];
  }
}
