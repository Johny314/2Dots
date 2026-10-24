// Форма состояния «Ключа и двери» на стороне renderer. Источник истины —
// packages/core/src/games/keys/types.ts; @2dots/core пока экспортирует только maze,
// поэтому здесь структурная копия (state всё равно приходит из сети как unknown).
import type { maze, PlayerId } from '@2dots/core';

export interface KeysConfig {
  width: number;
  height: number;
  speedCellsPerSec: number;
  timeLimitMs: number;
  fogRadius: number | null;
  doorsPerPlayer: number;
}

export interface Door {
  a: number;
  b: number;
  owner: PlayerId;
  plate: number;
  open: boolean;
  openedAtMs: number | null;
}

export interface KeysResult {
  winner: 'team' | 'none';
  reason: 'escaped' | 'timeout';
  timeMs: number;
  doorsOpened: number;
  totalDoors: number;
}

export interface KeysState {
  seed: number;
  config: KeysConfig;
  maze: maze.Maze;
  exit: [number, number];
  doors: Door[];
  players: Record<PlayerId, maze.MazePlayer>;
  tick: number;
  elapsedMs: number;
  result: KeysResult | null;
}

/** Радиус тумана при включённой настройке (как DEFAULT_FOG_RADIUS в core). */
export const KEYS_FOG_RADIUS = 3;
