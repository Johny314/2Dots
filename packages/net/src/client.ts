// Браузерная часть (renderer): GameClient на нативном WebSocket. Не импортировать Node API.
// Интерфейс — контракт для треков B (реализация), D (UI) и E (рендерер).
import type { PlayerId, ServerMsg } from '@2dots/core';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

export type ClientStatus = 'idle' | 'connecting' | 'connected' | 'closed';

export interface GameClientEvents {
  lobby: Msg<'lobby'>;
  start: Msg<'start'>;
  state: Msg<'state'>;
  end: Msg<'end'>;
  aborted: Msg<'aborted'>;
  error: Msg<'error'>;
  /** Соединение потеряно или закрыто сервером. Авто-переподключения нет. */
  disconnect: { reason: string };
}

export interface GameClient {
  readonly status: ClientStatus;
  /** Назначенный сервером id; null до welcome. */
  readonly you: PlayerId | null;
  /** Подключается и шлёт hello. Резолвится после welcome, реджектится при error/обрыве. */
  connect(host: string, port: number, name: string): Promise<PlayerId>;
  setReady(ready: boolean): void;
  /** Только хост (p1). */
  selectGame(gameId: string): void;
  /** seq проставляется внутри клиента. */
  sendInput(input: unknown): void;
  rematch(): void;
  disconnect(): void;
  /** Возвращает функцию отписки. */
  on<K extends keyof GameClientEvents>(
    event: K,
    handler: (payload: GameClientEvents[K]) => void,
  ): () => void;
}

export { createGameClient } from './game-client';
