// Туман войны: какие клетки видит игрок.
// TODO(phase2): заменить на maze.visibleCells из core (трек A), сигнатура та же.
import type { maze as MazeNs } from '@2dots/core';
import { bfs } from './grid';

/**
 * Клетки, видимые из (x, y): BFS по проходам (стены WALL блокируют обзор) не дальше radius шагов.
 * radius === null — туман выключен, видно всё. Возвращает индексы клеток (y * width + x).
 */
export function visibleCells(
  maze: MazeNs.Maze,
  x: number,
  y: number,
  radius: number | null,
): Set<number> {
  if (radius === null) return new Set(maze.walls.keys());
  return new Set(bfs(maze, x, y, Math.max(0, radius)).keys());
}
