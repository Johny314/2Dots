import type { PlayerId } from '../../minigame';
import type { Maze, MazeInput, MazePlayer } from '../maze/types';

export interface TerritoryConfig {
  width: number;
  height: number;
  /** Доля тупиков, превращённых в петли: петли делают погоню и перекраску интереснее. */
  braid: number;
  speedCellsPerSec: number;
  timeLimitMs: number;
  /** null — туман выключен. */
  fogRadius: number | null;
}

/** Ввод тот же, что у лабиринта: удерживаемое направление. */
export type TerritoryInput = MazeInput;

/** Владелец клетки в owner[]: 0 — ничья, 1 — p1, 2 — p2. */
export type CellOwner = 0 | 1 | 2;

export interface TerritoryState {
  seed: number;
  config: TerritoryConfig;
  maze: Maze;
  tick: number;
  elapsedMs: number;
  players: Record<PlayerId, MazePlayer>;
  /** owner[y * width + x] — CellOwner. */
  owner: number[];
  /** Сколько клеток у каждого сейчас (всегда согласовано с owner) — для HUD. */
  counts: Record<PlayerId, number>;
  /** Заполняется в момент окончания раунда. */
  result: TerritoryResult | null;
}

export interface TerritoryResult {
  winner: PlayerId | 'draw';
  reason: 'timeout';
  /** Закрашенные клетки. */
  scores: Record<PlayerId, number>;
  totalCells: number;
}
