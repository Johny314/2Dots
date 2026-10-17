import { Rng } from '../../rng';
import { DELTA, DIRS, OPPOSITE, inBounds } from './grid';
import { WALL, type Dir, type Maze } from './types';

const ALL_WALLS = WALL.up | WALL.right | WALL.down | WALL.left;

function wallCount(mask: number): number {
  let n = 0;
  for (const dir of DIRS) if (mask & WALL[dir]) n++;
  return n;
}

/** Убирает стену между клеткой (x, y) и соседом в направлении dir — у обеих клеток. */
function carve(maze: Maze, x: number, y: number, dir: Dir): void {
  const [dx, dy] = DELTA[dir];
  const a = y * maze.width + x;
  const b = (y + dy) * maze.width + x + dx;
  maze.walls[a] = (maze.walls[a] as number) & ~WALL[dir];
  maze.walls[b] = (maze.walls[b] as number) & ~WALL[OPPOSITE[dir]];
}

/**
 * Детерминированный лабиринт из seed: recursive backtracker (идеальный лабиринт),
 * затем доля braid тупиков превращается в петли. braid = 0 — идеальный лабиринт.
 */
export function generateMaze(seed: number, width: number, height: number, braid = 0): Maze {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Некорректный размер лабиринта: ${width}×${height}`);
  }
  const rng = new Rng(seed);
  const maze: Maze = { width, height, walls: new Array<number>(width * height).fill(ALL_WALLS) };

  // Recursive backtracker на явном стеке.
  const seen = new Array<boolean>(width * height).fill(false);
  const startCell = rng.int(width * height);
  seen[startCell] = true;
  const stack = [startCell];
  while (stack.length > 0) {
    const cell = stack[stack.length - 1] as number;
    const x = cell % width;
    const y = (cell - x) / width;
    const options = DIRS.filter((dir) => {
      const [dx, dy] = DELTA[dir];
      return inBounds(maze, x + dx, y + dy) && !seen[(y + dy) * width + x + dx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const dir = rng.pick(options);
    const [dx, dy] = DELTA[dir];
    const next = (y + dy) * width + x + dx;
    carve(maze, x, y, dir);
    seen[next] = true;
    stack.push(next);
  }

  // Случайность для braid тратится после генерации: braid = 0 не меняет идеальный лабиринт.
  if (braid > 0) braidMaze(maze, rng, braid);
  return maze;
}

/** Убирает одну стену у доли braid тупиков; предпочитает соседа, который тоже тупик. */
function braidMaze(maze: Maze, rng: Rng, braid: number): void {
  const { width, walls } = maze;
  const isDeadEnd = (cell: number) => wallCount(walls[cell] as number) === 3;
  const deadEnds: number[] = [];
  for (let i = 0; i < walls.length; i++) if (isDeadEnd(i)) deadEnds.push(i);
  rng.shuffle(deadEnds);
  for (const cell of deadEnds) {
    if (!isDeadEnd(cell) || rng.next() >= braid) continue;
    const x = cell % width;
    const y = (cell - x) / width;
    const candidates = DIRS.filter((dir) => {
      const [dx, dy] = DELTA[dir];
      return ((walls[cell] as number) & WALL[dir]) !== 0 && inBounds(maze, x + dx, y + dy);
    });
    if (candidates.length === 0) continue;
    const deadNeighbours = candidates.filter((dir) => {
      const [dx, dy] = DELTA[dir];
      return isDeadEnd((y + dy) * width + x + dx);
    });
    carve(maze, x, y, rng.pick(deadNeighbours.length > 0 ? deadNeighbours : candidates));
  }
}
