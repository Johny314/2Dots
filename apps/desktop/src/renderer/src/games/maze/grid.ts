// Геометрия сетки лабиринта: направления, проходимость, BFS.
import { maze as mazeCore } from '@2dots/core';
import type { maze as MazeNs } from '@2dots/core';

type Dir = MazeNs.Dir;
type Maze = MazeNs.Maze;

const { WALL } = mazeCore;

export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

export const DIR_VEC: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = {
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right',
};

export function cellIndex(maze: Maze, x: number, y: number): number {
  return y * maze.width + x;
}

export function inBounds(maze: Maze, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height;
}

/** Можно ли шагнуть из (x, y) в направлении dir: внутри поля и без стены. */
export function canMove(maze: Maze, x: number, y: number, dir: Dir): boolean {
  const [dx, dy] = DIR_VEC[dir];
  if (!inBounds(maze, x + dx, y + dy)) return false;
  return ((maze.walls[cellIndex(maze, x, y)] ?? 0) & WALL[dir]) === 0;
}

/**
 * BFS по проходам от клетки (x, y). Возвращает расстояния до клеток (индекс → шаги),
 * не дальше maxDepth (Infinity — без ограничения).
 */
export function bfs(maze: Maze, x: number, y: number, maxDepth = Infinity): Map<number, number> {
  const dist = new Map<number, number>();
  if (!inBounds(maze, x, y)) return dist;
  dist.set(cellIndex(maze, x, y), 0);
  const queue: [number, number][] = [[x, y]];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head] as [number, number];
    const d = dist.get(cellIndex(maze, cx, cy)) ?? 0;
    if (d >= maxDepth) continue;
    for (const dir of DIRS) {
      if (!canMove(maze, cx, cy, dir)) continue;
      const [dx, dy] = DIR_VEC[dir];
      const ni = cellIndex(maze, cx + dx, cy + dy);
      if (dist.has(ni)) continue;
      dist.set(ni, d + 1);
      queue.push([cx + dx, cy + dy]);
    }
  }
  return dist;
}
