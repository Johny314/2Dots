// Хелперы для интеграционных тестов сети (только для *.test.ts).
import { WebSocket as WsSocket } from 'ws';
import { PROTOCOL_VERSION, parseServerMsg, type ServerMsg } from '@2dots/core';
import type { GameClient, GameClientEvents } from './client';
import { createGameClient } from './game-client';

export const HOST = '127.0.0.1';

/** Ждёт событие клиента, удовлетворяющее условию. */
export function waitFor<K extends keyof GameClientEvents>(
  client: GameClient,
  event: K,
  predicate: (payload: GameClientEvents[K]) => boolean = () => true,
  timeoutMs = 5000,
): Promise<GameClientEvents[K]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Не дождались события ${event}`));
    }, timeoutMs);
    const off = client.on(event, (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      off();
      resolve(payload);
    });
  });
}

export async function connectClient(port: number, name: string): Promise<GameClient> {
  const client = createGameClient();
  await client.connect(HOST, port, name);
  return client;
}

/** «Сырой» сокет для проверки реакции сервера на некорректные сообщения. */
export interface RawConn {
  send(data: unknown): void;
  next(predicate?: (msg: ServerMsg) => boolean): Promise<ServerMsg>;
  closed: Promise<void>;
  close(): void;
}

export function rawConnect(port: number): Promise<RawConn> {
  return new Promise((resolve, reject) => {
    const ws = new WsSocket(`ws://${HOST}:${port}`);
    const queue: ServerMsg[] = [];
    const waiters: { predicate: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
    const closed = new Promise<void>((r) => ws.once('close', () => r()));
    ws.on('message', (data) => {
      const msg = parseServerMsg(String(data));
      if (!msg) throw new Error(`Сервер прислал невалидное сообщение: ${String(data)}`);
      const idx = waiters.findIndex((w) => w.predicate(msg));
      if (idx >= 0) {
        const [w] = waiters.splice(idx, 1);
        w?.resolve(msg);
      } else {
        queue.push(msg);
      }
    });
    ws.once('error', reject);
    ws.once('open', () =>
      resolve({
        send: (data) => ws.send(typeof data === 'string' ? data : JSON.stringify(data)),
        next: (predicate = () => true) => {
          const idx = queue.findIndex(predicate);
          if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0] as ServerMsg);
          return new Promise((res) => waiters.push({ predicate, resolve: res }));
        },
        closed,
        close: () => ws.close(),
      }),
    );
  });
}

export const hello = (name: string, v = PROTOCOL_VERSION) => ({ t: 'hello', v, name });
