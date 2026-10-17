import type { PlayerId } from '../../minigame';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Битмаска стен клетки. Бит установлен — стена есть. */
export const WALL = { up: 1, right: 2, down: 4, left: 8 } as const satisfies Record<Dir, number>;

export type Scoring = 'bfs' | 'distinct' | 'steps';

export interface MazeConfig {
  width: number;
  height: number;
  speedCellsPerSec: number;
  /** null — туман выключен. */
  fogRadius: number | null;
  timeLimitMs: number;
  scoring: Scoring;
  /** Доля тупиков, которые превращаются в петли (0 — идеальный лабиринт). */
  braid: number;
}

/** Ввод: текущее удерживаемое направление (null — ничего не нажато). */
export interface MazeInput {
  dir: Dir | null;
}

export interface Maze {
  width: number;
  height: number;
  /** walls[y * width + x] — битмаска WALL. */
  walls: number[];
}

export interface MazePlayer {
  x: number;
  y: number;
  /** Направление, в котором игрок сейчас движется. */
  dir: Dir | null;
  /** Удерживаемое направление; применится на ближайшем возможном повороте. */
  queued: Dir | null;
  /** Прогресс перехода в соседнюю клетку, 0..1. */
  moveProgress: number;
  /** Индексы посещённых клеток (y * width + x), без повторов, в порядке посещения. */
  visited: number[];
  /** Всего пройдено клеток, включая возвраты. */
  steps: number;
}

export interface MazeState {
  seed: number;
  config: MazeConfig;
  /** Генерируется из seed детерминированно; передаётся в state для простоты (≈2 КБ). */
  maze: Maze;
  tick: number;
  elapsedMs: number;
  players: Record<PlayerId, MazePlayer>;
  /** Заполняется в момент окончания раунда. */
  result: MazeResult | null;
}

export interface MazeResult {
  winner: PlayerId | 'draw';
  reason: 'met' | 'timeout';
  scores: Record<PlayerId, number>;
  meetCell: [number, number] | null;
  /** Длина кратчайшего пути между стартами (в клетках). */
  pathLength: number;
}
