// GameClient на глобальном WebSocket (есть в браузере и в Node 24). Без Node API.
import { PROTOCOL_VERSION, parseServerMsg, type ClientMsg, type PlayerId } from '@2dots/core';
import type { ClientStatus, GameClient, GameClientEvents } from './client';

type Handler<K extends keyof GameClientEvents> = (payload: GameClientEvents[K]) => void;
type HandlerMap = { [K in keyof GameClientEvents]: Set<Handler<K>> };

function wsUrl(host: string, port: number): string {
  // IPv6-адрес нужно взять в квадратные скобки.
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `ws://${h}:${port}`;
}

export function createGameClient(): GameClient {
  let status: ClientStatus = 'idle';
  let you: PlayerId | null = null;
  let socket: WebSocket | null = null;
  let seq = 0;
  /** Завершение текущего соединения — чтобы disconnect() сообщал о закрытии сразу. */
  const closers = new WeakMap<WebSocket, (reason: string) => void>();

  const handlers: HandlerMap = {
    lobby: new Set(),
    start: new Set(),
    state: new Set(),
    end: new Set(),
    aborted: new Set(),
    error: new Set(),
    disconnect: new Set(),
  };

  function emit<K extends keyof GameClientEvents>(event: K, payload: GameClientEvents[K]): void {
    for (const handler of [...handlers[event]]) handler(payload);
  }

  function send(msg: ClientMsg): void {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  const client: GameClient = {
    get status() {
      return status;
    },
    get you() {
      return you;
    },

    connect(host, port, name) {
      if (status === 'connecting' || status === 'connected') {
        return Promise.reject(new Error('Клиент уже подключён'));
      }
      status = 'connecting';
      you = null;
      seq = 0;

      return new Promise<PlayerId>((resolve, reject) => {
        let settled = false;
        let disconnected = false;
        const settle = (err: Error | null, id?: PlayerId) => {
          if (settled) return;
          settled = true;
          if (err) reject(err);
          else resolve(id as PlayerId);
        };

        let ws: WebSocket;
        try {
          ws = new WebSocket(wsUrl(host, port));
        } catch (err) {
          status = 'closed';
          settle(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        socket = ws;

        const finish = (reason: string) => {
          if (disconnected) return;
          disconnected = true;
          if (socket === ws) socket = null;
          // disconnect — только для установленного соединения; неудачный connect() просто реджектится.
          const wasConnected = settled && status === 'connected';
          status = 'closed';
          settle(new Error(`Соединение закрыто: ${reason}`));
          if (wasConnected) emit('disconnect', { reason });
        };
        // Используется disconnect() для синхронного закрытия.
        closers.set(ws, finish);

        ws.addEventListener('open', () => {
          send({ t: 'hello', v: PROTOCOL_VERSION, name });
        });

        ws.addEventListener('message', (ev: MessageEvent) => {
          if (typeof ev.data !== 'string') return;
          const msg = parseServerMsg(ev.data);
          if (!msg) return;
          switch (msg.t) {
            case 'welcome':
              you = msg.you;
              status = 'connected';
              settle(null, msg.you);
              return;
            case 'error':
              if (!settled) settle(new Error(`${msg.code}: ${msg.message}`));
              emit('error', msg);
              return;
            default:
              emit(msg.t, msg as never);
          }
        });

        ws.addEventListener('error', () => {
          settle(new Error(`Не удалось подключиться к ${host}:${port}`));
        });

        ws.addEventListener('close', (ev: CloseEvent) => {
          finish(ev.reason || (settled ? 'сервер закрыл соединение' : 'нет соединения'));
        });
      });
    },

    setReady(ready) {
      send({ t: 'ready', ready });
    },
    selectGame(gameId) {
      send({ t: 'select', gameId });
    },
    setConfig(config) {
      send({ t: 'config', config });
    },
    sendInput(input) {
      send({ t: 'input', seq: seq++, input });
    },
    rematch() {
      send({ t: 'rematch' });
    },

    disconnect() {
      const ws = socket;
      if (!ws) return;
      ws.close();
      closers.get(ws)?.('клиент отключился');
    },

    on(event, handler) {
      const set = handlers[event] as Set<typeof handler>;
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
  };

  return client;
}
