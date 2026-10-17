// Node-часть (main-процесс Electron, бот): хост-сервер и mDNS.
// Интерфейсы — контракт между треками B (реализация) и C (Electron main). Не менять без отдельной задачи.
import type { AnyMiniGame } from '@2dots/core';

export interface HostServerOptions {
  /** По умолчанию DEFAULT_PORT. 0 — случайный свободный порт (для тестов). */
  port?: number;
  /** По умолчанию GAMES из реестра core. */
  games?: Readonly<Record<string, AnyMiniGame>>;
  /** Длительность отсчёта перед раундом, по умолчанию 3000 (в тестах можно 0). */
  countdownMs?: number;
}

export interface HostServerHandle {
  /** Фактический порт (важно при port: 0). */
  readonly port: number;
  stop(): Promise<void>;
}

/** Поднимает ws-сервер на 0.0.0.0 и игровой цикл. */
export function startHostServer(_options?: HostServerOptions): Promise<HostServerHandle> {
  return Promise.reject(new Error('не реализовано (трек B)'));
}

export interface DiscoveredHost {
  name: string;
  ip: string;
  port: number;
}

/** Публикует хост по mDNS. Возвращает функцию отмены публикации. */
export function publishHost(_name: string, _port: number): () => void {
  throw new Error('не реализовано (трек B)');
}

/** Ищет хосты в локальной сети в течение timeoutMs (по умолчанию 2000). */
export function findHosts(_timeoutMs?: number): Promise<DiscoveredHost[]> {
  return Promise.reject(new Error('не реализовано (трек B)'));
}
