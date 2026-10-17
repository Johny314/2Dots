// ВРЕМЕННАЯ симуляция лабиринта для локального режима (Фаза 1).
// В core пока заглушка: generateMaze без стен, tick не двигает игроков.
// TODO(phase2): заменить devGenerateMaze/devTick на generateMaze/mazeGame.tick из core (трек A).
import { maze, Rng, type PlayerId } from '@2dots/core';
import { bfs, canMove, cellIndex, DIR_VEC, DIRS, OPPOSITE } from './grid';

type MazeState = maze.MazeState;
type MazePlayer = maze.MazePlayer;

const { mazeGame, WALL } = maze;

/** Recursive backtracker: идеальный лабиринт, стены симметричны у соседей. */
export function devGenerateMaze(seed: number, width: number, height: number): maze.Maze {
  const all = WALL.up | WALL.right | WALL.down | WALL.left;
  const walls = new Array<number>(width * height).fill(all);
  const seen = new Uint8Array(width * height);
  const rng = new Rng(seed);
  const stack: [number, number][] = [[0, 0]];
  seen[0] = 1;
  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1] as [number, number];
    const options = DIRS.filter((d) => {
      const [dx, dy] = DIR_VEC[d];
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < width && ny < height && !seen[ny * width + nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const d = rng.pick(options);
    const [dx, dy] = DIR_VEC[d];
    const i = y * width + x;
    const ni = (y + dy) * width + (x + dx);
    walls[i] = (walls[i] ?? 0) & ~WALL[d];
    walls[ni] = (walls[ni] ?? 0) & ~WALL[OPPOSITE[d]];
    seen[ni] = 1;
    stack.push([x + dx, y + dy]);
  }
  return { width, height, walls };
}

/** mazeGame.init из core + тестовый лабиринт со стенами. */
export function devInit(seed: number, config = mazeGame.defaultConfig()): MazeState {
  const state = mazeGame.init(seed, ['p1', 'p2'], config);
  state.maze = devGenerateMaze(seed, config.width, config.height);
  return state;
}

function movePlayer(state: MazeState, p: MazePlayer, dtMs: number): void {
  const m = state.maze;
  // Разворот на ходу — сразу, как в Pac-Man.
  if (p.dir && p.queued === OPPOSITE[p.dir] && p.moveProgress > 0) {
    const [dx, dy] = DIR_VEC[p.dir];
    p.x += dx;
    p.y += dy;
    p.dir = p.queued;
    p.moveProgress = 1 - p.moveProgress;
  }
  let budget = (state.config.speedCellsPerSec * dtMs) / 1000;
  while (budget > 0) {
    if (p.moveProgress === 0) {
      // На границе клетки: выбрать направление.
      if (p.queued === null) p.dir = null;
      else if (canMove(m, p.x, p.y, p.queued)) p.dir = p.queued;
      else if (!p.dir || !canMove(m, p.x, p.y, p.dir)) p.dir = null;
      if (!p.dir) return;
    }
    const step = Math.min(budget, 1 - p.moveProgress);
    p.moveProgress += step;
    budget -= step;
    if (p.moveProgress >= 1 - 1e-9 && p.dir) {
      const [dx, dy] = DIR_VEC[p.dir];
      p.x += dx;
      p.y += dy;
      p.moveProgress = 0;
      p.steps++;
      const i = cellIndex(m, p.x, p.y);
      if (!p.visited.includes(i)) p.visited.push(i);
    }
  }
}

function met(state: MazeState): boolean {
  const { p1, p2 } = state.players;
  if (p1.x === p2.x && p1.y === p2.y) return true;
  for (const d of DIRS) {
    const [dx, dy] = DIR_VEC[d];
    if (p1.x + dx === p2.x && p1.y + dy === p2.y) return canMove(state.maze, p1.x, p1.y, d);
  }
  return false;
}

/** mazeGame.tick из core (время, таймаут) + движение и встреча. */
export function devTick(state: MazeState, dtMs: number): void {
  if (state.result) return;
  mazeGame.tick(state, dtMs);
  if (state.result) return;
  for (const id of ['p1', 'p2'] as const) movePlayer(state, state.players[id], dtMs);
  if (!met(state)) return;

  const { width, height } = state.config;
  const starts: Record<PlayerId, [number, number]> = { p1: [0, 0], p2: [width - 1, height - 1] };
  const score = (id: PlayerId): number => {
    const [sx, sy] = starts[id];
    const p = state.players[id];
    return bfs(state.maze, sx, sy).get(cellIndex(state.maze, p.x, p.y)) ?? 0;
  };
  const scores = { p1: score('p1'), p2: score('p2') };
  const pathLength =
    bfs(state.maze, 0, 0).get(cellIndex(state.maze, width - 1, height - 1)) ?? width + height - 2;
  state.result = {
    winner: scores.p1 > scores.p2 ? 'p1' : scores.p2 > scores.p1 ? 'p2' : 'draw',
    reason: 'met',
    scores,
    meetCell: [state.players.p1.x, state.players.p1.y],
    pathLength,
  };
}
