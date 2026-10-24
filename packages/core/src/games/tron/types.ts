import type { PlayerId } from '../../minigame';
import type { Dir } from '../maze/types';

export type { Dir };

export interface TronConfig {
  width: number;
  height: number;
  /** Скорость растёт со временем (см. speedAt). */
  accelerate: boolean;
  /** Сквозные края: выход за край — появление с противоположной стороны. */
  wrap: boolean;
  timeLimitMs: number;
}

/** Ввод: новое направление (null — без изменений). */
export interface TronInput {
  dir: Dir | null;
}

export interface TronPlayer {
  /** Клетка головы. */
  x: number;
  y: number;
  /** Направление последнего шага. */
  dir: Dir;
  /** Отложенные повороты (≤ MAX_QUEUE), применяются по одному на шаг. */
  queue: Dir[];
  alive: boolean;
}

/** Обо что разбился игрок. head — столкновение лоб в лоб (одна клетка или обмен клетками). */
export type CrashCause = 'wall' | 'trail' | 'head';

/** Значение клетки следа: 0 — пусто, 1 — след p1, 2 — след p2. */
export const TRAIL_OWNER: Readonly<Record<PlayerId, number>> = { p1: 1, p2: 2 };

export interface TronState {
  seed: number;
  config: TronConfig;
  tick: number;
  elapsedMs: number;
  /** Накопленный прогресс до следующего шага (в клетках, 0..1). */
  progress: number;
  /** trail[y * width + x] — 0 / 1 / 2 (см. TRAIL_OWNER). */
  trail: number[];
  players: Record<PlayerId, TronPlayer>;
  result: TronResult | null;
}

export interface TronResult {
  winner: PlayerId | 'draw';
  reason: 'crash' | 'both' | 'timeout';
  /** Клетка головы разбившегося игрока (последняя занятая); null — не разбился. */
  crash: Record<PlayerId, [number, number] | null>;
  /** Обо что разбился; null — не разбился. */
  cause: Record<PlayerId, CrashCause | null>;
  /** Длина следа в клетках. */
  lengths: Record<PlayerId, number>;
  /** Всего клеток арены — знаменатель для «% арены». */
  totalCells: number;
  durationMs: number;
}
