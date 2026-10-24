import type { PlayerId } from '../../minigame';
import type { Dir, Maze, MazePlayer } from '../maze/types';

export interface KeysConfig {
  width: number;
  height: number;
  speedCellsPerSec: number;
  timeLimitMs: number;
  /** null — туман выключен. */
  fogRadius: number | null;
  /** Сколько дверей на пути каждого игрока к выходу (2 или 3). */
  doorsPerPlayer: number;
}

/** Ввод: удерживаемое направление (как в лабиринте). */
export interface KeysInput {
  dir: Dir | null;
}

/**
 * Дверь на проходе между соседними клетками a и b (индексы y * width + x).
 * owner — чей путь к выходу она перекрывает (и её цвет); закрытая дверь не пускает никого.
 * plate — клетка с плитой: наступил — дверь открылась навсегда.
 */
export interface Door {
  a: number;
  b: number;
  owner: PlayerId;
  plate: number;
  open: boolean;
  /** elapsedMs момента открытия (для анимации); null — закрыта. */
  openedAtMs: number | null;
}

export interface KeysState {
  seed: number;
  config: KeysConfig;
  maze: Maze;
  /** Клетка выхода [x, y] — центр лабиринта. */
  exit: [number, number];
  doors: Door[];
  players: Record<PlayerId, MazePlayer>;
  tick: number;
  elapsedMs: number;
  result: KeysResult | null;
}

export interface KeysResult {
  winner: 'team' | 'none';
  reason: 'escaped' | 'timeout';
  timeMs: number;
  doorsOpened: number;
  totalDoors: number;
}
