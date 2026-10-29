import type { PlayerId } from '../../minigame';
import type { Dir, Maze, MazePlayer } from '../maze/types';

/** Кто прячется: random — по seed раунда, p1 — хост, p2 — гость. */
export type HideRoles = 'random' | PlayerId;

export interface HideConfig {
  width: number;
  height: number;
  /** Доля тупиков, которые превращаются в петли: прятаться интереснее, когда есть обходы. */
  braid: number;
  speedCellsPerSec: number;
  /** Туман войны — всегда: иначе прятаться негде. */
  fogRadius: number;
  /** «Горячо-холодно»: оба видят, насколько близко соперник (по пути в лабиринте). */
  hotCold: boolean;
  roles: HideRoles;
  /** Весь раунд, включая фору. */
  timeLimitMs: number;
  /** Фора прячущемуся: искатель стоит на месте. */
  headStartMs: number;
  /** Подсказок у искателя за раунд. */
  hints: number;
  /** Сколько длится подсказка. */
  hintMs: number;
  /** Прячущийся стоит на месте столько — его след пропадает. */
  trailFadeMs: number;
}

/** Ввод: удерживаемое направление; hint — искатель просит подсказку. */
export interface HideInput {
  dir: Dir | null;
  hint?: boolean;
}

/** Подсказка: область (квадрат радиуса radius), где-то в которой прячущийся. */
export interface HideHint {
  x: number;
  y: number;
  radius: number;
  untilMs: number;
}

export interface HideState {
  seed: number;
  config: HideConfig;
  maze: Maze;
  tick: number;
  elapsedMs: number;
  /** Кто прячется в этом раунде (второй — ищет). */
  hider: PlayerId;
  players: Record<PlayerId, MazePlayer>;
  /** Свежий след прячущегося: индексы клеток, от старых к новым. Его видит искатель. */
  trail: number[];
  /** Сколько мс прячущийся стоит на месте. */
  stillMs: number;
  hintsLeft: number;
  hint: HideHint | null;
  result: HideResult | null;
}

export interface HideResult {
  /** Нашёл — искатель, не нашёл до конца времени — прячущийся. */
  winner: PlayerId;
  reason: 'found' | 'timeout';
  hider: PlayerId;
  /** Когда нашёл (или длительность раунда). */
  timeMs: number;
  /** Сколько длилась фора — чтобы показать время поиска. */
  headStartMs: number;
  /** Длительность раунда по правилам (с форой). */
  timeLimitMs: number;
  hintsUsed: number;
  /** Где нашёл; null — не нашёл. */
  foundCell: [number, number] | null;
}
