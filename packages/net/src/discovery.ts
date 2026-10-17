// mDNS: публикация хоста и поиск хостов в локальной сети (Node).
import { isIPv4 } from 'node:net';
import { Bonjour } from 'bonjour-service';
import { MDNS_SERVICE_TYPE } from '@2dots/core';

export interface DiscoveredHost {
  name: string;
  ip: string;
  port: number;
}

const DEFAULT_FIND_TIMEOUT_MS = 2000;

/** Публикует хост по mDNS. Возвращает функцию отмены публикации. */
export function publishHost(name: string, port: number): () => void {
  const bonjour = new Bonjour({}, () => {});
  const service = bonjour.publish({ name, type: MDNS_SERVICE_TYPE, port, disableIPv6: true });
  // Ошибки mDNS (например, конфликт имени) не должны ронять хост — ручной ввод IP остаётся.
  service.on('error', () => {});
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      service.stop(() => bonjour.destroy());
    } catch {
      bonjour.destroy();
    }
  };
}

/** Ищет хосты в локальной сети в течение timeoutMs (по умолчанию 2000). Никогда не реджектится. */
export function findHosts(timeoutMs: number = DEFAULT_FIND_TIMEOUT_MS): Promise<DiscoveredHost[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredHost>();
    let bonjour: Bonjour;
    try {
      bonjour = new Bonjour({}, () => {});
    } catch {
      resolve([]);
      return;
    }
    const browser = bonjour.find({ type: MDNS_SERVICE_TYPE }, (service) => {
      const candidates = [...(service.addresses ?? []), service.referer?.address ?? ''];
      const ip = candidates.find((a) => isIPv4(a));
      if (ip === undefined) return;
      const key = `${ip}:${service.port}`;
      if (!found.has(key)) found.set(key, { name: service.name, ip, port: service.port });
    });
    setTimeout(() => {
      try {
        browser.stop();
        bonjour.destroy();
      } catch {
        // игнорируем ошибки при закрытии
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}
