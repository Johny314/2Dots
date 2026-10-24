// Форма state «Территории» на стороне renderer. Повторяет core/src/games/territory/types.ts:
// пакет @2dots/core пока экспортирует только пространство имён maze.
import type { maze, PlayerId } from '@2dots/core';

export interface TerritoryConfig {
  width: number;
  height: number;
  braid: number;
  speedCellsPerSec: number;
  timeLimitMs: number;
  /** null — туман выключен. */
  fogRadius: number | null;
}

export interface TerritoryResult {
  winner: PlayerId | 'draw';
  reason: 'timeout';
  scores: Record<PlayerId, number>;
  totalCells: number;
}

export interface TerritoryState {
  seed: number;
  config: TerritoryConfig;
  maze: maze.Maze;
  tick: number;
  elapsedMs: number;
  players: Record<PlayerId, maze.MazePlayer>;
  /** owner[y * width + x]: 0 — ничья, 1 — p1, 2 — p2. */
  owner: number[];
  counts: Record<PlayerId, number>;
  result: TerritoryResult | null;
}

/** Радиус тумана, когда хост его включает (как DEFAULT_FOG_RADIUS в core). */
export const FOG_RADIUS = 3;
export const DEFAULT_TIME_LIMIT_MS = 90_000;
export const LONG_TIME_LIMIT_MS = 150_000;

/** Код владельца → игрок. */
export const ownerId = (code: number | undefined): PlayerId | null =>
  code === 1 ? 'p1' : code === 2 ? 'p2' : null;
