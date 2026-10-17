import { WALL, type Dir, type Maze } from './types';

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export const DELTA: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function inBounds(maze: Maze, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height;
}

/** Есть ли проход из клетки (x, y) в направлении dir (внутри поля и без стены). */
export function canMove(maze: Maze, x: number, y: number, dir: Dir): boolean {
  const [dx, dy] = DELTA[dir];
  if (!inBounds(maze, x, y) || !inBounds(maze, x + dx, y + dy)) return false;
  return ((maze.walls[y * maze.width + x] as number) & WALL[dir]) === 0;
}

/**
 * Расстояния (в шагах по проходам) от клетки (x, y) до каждой клетки, индекс y * width + x.
 * -1 — клетка недостижима.
 */
export function bfsDistances(maze: Maze, x: number, y: number): number[] {
  return limitedBfs(maze, x, y, Infinity).dist;
}

/**
 * Туман войны: индексы клеток (y * width + x), достижимых по проходам за <= radius шагов —
 * стены блокируют обзор. Порядок — по возрастанию расстояния, первая — сама клетка.
 */
export function visibleCells(maze: Maze, x: number, y: number, radius: number): number[] {
  return limitedBfs(maze, x, y, radius).order;
}

function limitedBfs(
  maze: Maze,
  x: number,
  y: number,
  limit: number,
): { dist: number[]; order: number[] } {
  const { width } = maze;
  const dist = new Array<number>(width * maze.height).fill(-1);
  const order: number[] = [];
  if (!inBounds(maze, x, y) || limit < 0) return { dist, order };
  const start = y * width + x;
  dist[start] = 0;
  order.push(start);
  for (let head = 0; head < order.length; head++) {
    const cell = order[head] as number;
    const d = dist[cell] as number;
    if (d >= limit) continue;
    const cx = cell % width;
    const cy = (cell - cx) / width;
    for (const dir of DIRS) {
      if (!canMove(maze, cx, cy, dir)) continue;
      const [dx, dy] = DELTA[dir];
      const next = (cy + dy) * width + cx + dx;
      if (dist[next] !== -1) continue;
      dist[next] = d + 1;
      order.push(next);
    }
  }
  return { dist, order };
}
