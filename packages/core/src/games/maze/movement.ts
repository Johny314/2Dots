// Клеточное движение точек по лабиринту — общее для мини-игр на лабиринте
// (maze, territory, keys): удержание направления, буфер поворота, мгновенный разворот,
// дробление на подшаги, встреча.
import type { PlayerId } from '../../minigame';
import { DELTA, DIRS, OPPOSITE, canMove } from './grid';
import type { Dir, Maze, MazePlayer } from './types';

/**
 * Можно ли из клетки (x, y) пройти в направлении dir. По умолчанию — нет стены (canMove);
 * мини-игры с препятствиями (двери и т. п.) передают свою проверку.
 */
export type Passable = (maze: Maze, x: number, y: number, dir: Dir) => boolean;

/** Путь в клетках за тик и число подшагов не длиннее MAX_SUBSTEP_CELLS (защита от «проскока»). */
export function substeps(speedCellsPerSec: number, dtMs: number): { chunk: number; count: number } {
  const budget = Math.max(0, (speedCellsPerSec * dtMs) / 1000);
  const count = Math.max(1, Math.ceil(budget / MAX_SUBSTEP_CELLS));
  return { chunk: budget / count, count };
}

/** Максимальный путь игрока за один подшаг тика — защита от «проскока» навстречу. */
export const MAX_SUBSTEP_CELLS = 0.5;

/** Стартовые клетки: p1 — левый верхний угол, p2 — правый нижний. */
export function startCell(
  maze: Pick<Maze, 'width' | 'height'>,
  player: PlayerId,
): [number, number] {
  return player === 'p1' ? [0, 0] : [maze.width - 1, maze.height - 1];
}

export function makePlayer(x: number, y: number, width: number): MazePlayer {
  return { x, y, dir: null, queued: null, moveProgress: 0, visited: [y * width + x], steps: 0 };
}

/**
 * Направление на перекрёстке (в центре клетки): удерживаемое, если туда можно пройти;
 * иначе продолжаем текущее (буфер поворота, как в Pac-Man); ничего не удерживается — стоп.
 */
function chooseDir(maze: Maze, p: MazePlayer, passable: Passable): Dir | null {
  if (p.queued === null) return null;
  if (passable(maze, p.x, p.y, p.queued)) return p.queued;
  if (p.dir !== null && passable(maze, p.x, p.y, p.dir)) return p.dir;
  return null;
}

/**
 * Мгновенный разворот: удерживается направление, противоположное движению, посреди перехода
 * A → B. Игрок разворачивается на месте: теперь он идёт B → A с прогрессом 1 − moveProgress
 * (физическая позиция не меняется). Клетка B ещё не достигнута — в visited и steps не попадает.
 */
function reverseIfOpposite(p: MazePlayer): void {
  if (p.dir === null || p.moveProgress <= 0 || p.queued !== OPPOSITE[p.dir]) return;
  const [dx, dy] = DELTA[p.dir];
  p.x += dx;
  p.y += dy;
  p.dir = p.queued;
  p.moveProgress = 1 - p.moveProgress;
}

/**
 * Окно «позднего поворота», в долях клетки: столько точка успевает проехать за перекрёсток,
 * а поворот всё ещё засчитывается на нём (≈40 мс при 7 клетках/с).
 */
export const LATE_TURN_WINDOW = 0.3;

/**
 * Новый ввод игрока: удерживаемое направление. Если поворот нажат чуть позже перекрёстка
 * (точка отъехала от центра не больше чем на LATE_TURN_WINDOW, а из покинутой клетки туда
 * можно пройти), точка возвращается в центр и повернёт на этом перекрёстке.
 */
export function setQueued(
  maze: Maze,
  p: MazePlayer,
  dir: Dir | null,
  passable: Passable = canMove,
): void {
  const changed = dir !== p.queued;
  p.queued = dir;
  if (!changed || dir === null || p.dir === null) return;
  if (dir === p.dir || dir === OPPOSITE[p.dir]) return;
  if (p.moveProgress <= 0 || p.moveProgress > LATE_TURN_WINDOW) return;
  if (!passable(maze, p.x, p.y, dir)) return;
  p.moveProgress = 0;
}

/** Продвигает игрока на budget клеток. Повороты — в центре клетки, разворот — сразу. */
export function advance(
  maze: Maze,
  p: MazePlayer,
  budget: number,
  passable: Passable = canMove,
): void {
  reverseIfOpposite(p);
  let left = budget;
  while (left > 0) {
    if (p.moveProgress === 0) {
      p.dir = chooseDir(maze, p, passable);
      if (p.dir === null) return;
    }
    const dir = p.dir as Dir;
    const need = 1 - p.moveProgress;
    if (left < need) {
      p.moveProgress += left;
      return;
    }
    left -= need;
    const [dx, dy] = DELTA[dir];
    p.x += dx;
    p.y += dy;
    p.moveProgress = 0;
    p.steps++;
    const cell = p.y * maze.width + p.x;
    if (!p.visited.includes(cell)) p.visited.push(cell);
  }
}

/** Встреча: одна клетка или соседние клетки без стены между ними. */
export function haveMet(maze: Maze, a: MazePlayer, b: MazePlayer): boolean {
  if (a.x === b.x && a.y === b.y) return true;
  return DIRS.some((dir) => {
    const [dx, dy] = DELTA[dir];
    return a.x + dx === b.x && a.y + dy === b.y && canMove(maze, a.x, a.y, dir);
  });
}
