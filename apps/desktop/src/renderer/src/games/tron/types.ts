// Форма state/result «Трона» на стороне renderer. Повторяет packages/core/src/games/tron/types.ts:
// core экспортирует пространства имён игр из index.ts, а «tron» там пока нет — поэтому типы
// структурные, а данные из сети считаются непроверенными.
import type { PlayerId } from '@2dots/core';

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface TronInput {
  dir: Dir | null;
}

export interface TronPlayerView {
  x: number;
  y: number;
  dir: Dir;
  queue: Dir[];
  alive: boolean;
}

export interface TronResultView {
  winner: PlayerId | 'draw';
  reason: 'crash' | 'both' | 'timeout';
  crash: Record<PlayerId, [number, number] | null>;
  cause?: Record<PlayerId, 'wall' | 'trail' | 'head' | null>;
  lengths: Record<PlayerId, number>;
  totalCells?: number;
  durationMs: number;
}

export interface TronStateView {
  seed: number;
  config: {
    width: number;
    height: number;
    accelerate: boolean;
    wrap: boolean;
    timeLimitMs: number;
  };
  tick: number;
  elapsedMs: number;
  progress: number;
  /** trail[y * width + x] — 0 пусто, 1 p1, 2 p2. */
  trail: number[];
  players: Record<PlayerId, TronPlayerView>;
  result: TronResultView | null;
}

export const DELTA: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Как speedAt в core: 8 клеток/с, с ускорением +0.5 каждые 5 с, не выше 14. */
export function speedAt(accelerate: boolean, elapsedMs: number): number {
  if (!accelerate) return 8;
  return Math.min(14, 8 + 0.5 * Math.floor(Math.max(0, elapsedMs) / 5000));
}

/** Минимальная проверка state из сети: достаточно для отрисовки без падений. */
export function isTronState(v: unknown): v is TronStateView {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<TronStateView>;
  return (
    typeof s.config === 'object' &&
    s.config !== null &&
    Array.isArray(s.trail) &&
    s.trail.length === s.config.width * s.config.height &&
    typeof s.players === 'object' &&
    s.players !== null &&
    typeof s.players.p1 === 'object' &&
    typeof s.players.p2 === 'object'
  );
}
