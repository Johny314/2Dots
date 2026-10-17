import type { MiniGame, PlayerId } from '../../minigame';
import type { Dir, Maze, MazeConfig, MazeInput, MazePlayer, MazeResult, MazeState } from './types';

export * from './types';

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

// ЗАГЛУШКА (Фаза 0): лабиринт без внутренних стен, движение и встреча не реализованы.
// Реализация — трек A в docs/PLAN.md.
export function generateMaze(_seed: number, width: number, height: number): Maze {
  const walls = new Array<number>(width * height).fill(0);
  return { width, height, walls };
}

function makePlayer(x: number, y: number, width: number): MazePlayer {
  return { x, y, dir: null, queued: null, moveProgress: 0, visited: [y * width + x], steps: 0 };
}

export const mazeGame: MiniGame<MazeConfig, MazeState, MazeInput, MazeResult> = {
  id: 'maze',
  title: 'Лабиринт',
  tickHz: 30,

  defaultConfig: () => ({
    width: 21,
    height: 15,
    speedCellsPerSec: 7,
    fogRadius: 3,
    timeLimitMs: 180_000,
    scoring: 'bfs',
    braid: 0,
  }),

  init(seed, _players, config) {
    const { width, height } = config;
    return {
      seed,
      config,
      maze: generateMaze(seed, width, height),
      tick: 0,
      elapsedMs: 0,
      players: {
        p1: makePlayer(0, 0, width),
        p2: makePlayer(width - 1, height - 1, width),
      },
      result: null,
    };
  },

  parseInput(raw) {
    if (typeof raw !== 'object' || raw === null || !('dir' in raw)) return null;
    const dir = (raw as { dir: unknown }).dir;
    if (dir === null || DIRS.includes(dir as Dir)) return { dir: dir as Dir | null };
    return null;
  },

  applyInput(state, player: PlayerId, input) {
    state.players[player].queued = input.dir;
  },

  tick(state, dtMs) {
    if (state.result) return;
    state.tick++;
    state.elapsedMs += dtMs;
    if (state.elapsedMs >= state.config.timeLimitMs) {
      state.result = {
        winner: 'draw',
        reason: 'timeout',
        scores: { p1: 0, p2: 0 },
        meetCell: null,
        pathLength: 0,
      };
    }
  },

  result: (state) => state.result,
};
