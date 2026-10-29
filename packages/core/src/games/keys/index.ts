// «Ключ и дверь» — кооператив: двери на пути одного игрока открывает плита, до которой
// может дойти только другой. Выбрались — оба одновременно стоят на выходе в центре.
import type { MiniGame, PlayerId } from '../../minigame';
import { generateMaze } from '../maze/generate';
import { DELTA, DIRS, canMove } from '../maze/grid';
import {
  advance,
  makePlayer,
  setQueued,
  startCell,
  substeps,
  type Passable,
} from '../maze/movement';
import type { Dir, Maze, MazePlayer } from '../maze/types';
import { closedEdges, edgeKey, neighbour, placeDoors } from './doors';
import type { KeysConfig, KeysInput, KeysResult, KeysState } from './types';

export * from './types';
export {
  MIN_PLATE_DISTANCE,
  closedEdges,
  edgeKey,
  otherPlayer,
  pathBetween,
  placeDoors,
  reachDistances,
  solveDoors,
  type SolveResult,
} from './doors';

/** Радиус тумана, когда он включён. */
export const DEFAULT_FOG_RADIUS = 3;
const FOG_RADIUS_RANGE = [1, 8] as const;
const DOORS_OPTIONS = [2, 3] as const;

/** Клетка выхода — центр поля. */
export function exitCell(maze: Pick<Maze, 'width' | 'height'>): [number, number] {
  return [Math.floor(maze.width / 2), Math.floor(maze.height / 2)];
}

/** Клетка, в которой точка находится физически (ближайший центр клетки). */
export function nearestCell(maze: Maze, p: MazePlayer): number {
  if (p.dir === null || p.moveProgress < 0.5) return p.y * maze.width + p.x;
  const [dx, dy] = DELTA[p.dir];
  return (p.y + dy) * maze.width + p.x + dx;
}

/** Проход: нет стены и нет закрытой двери. */
export function doorPassable(closed: ReadonlySet<number>): Passable {
  return (maze: Maze, x: number, y: number, dir: Dir) => {
    if (!canMove(maze, x, y, dir)) return false;
    const cell = y * maze.width + x;
    return !closed.has(edgeKey(cell, neighbour(maze, cell, dir)));
  };
}

function finish(state: KeysState, reason: KeysResult['reason']): KeysResult {
  return {
    winner: reason === 'escaped' ? 'team' : 'none',
    reason,
    timeMs: state.elapsedMs,
    doorsOpened: state.doors.filter((d) => d.open).length,
    totalDoors: state.doors.length,
  };
}

export const keysGame: MiniGame<KeysConfig, KeysState, KeysInput, KeysResult> = {
  id: 'keys',
  title: 'Ключ и дверь',
  description: 'Вместе: открывайте двери друг другу и выберитесь из лабиринта',
  kind: 'coop',
  tickHz: 30,

  defaultConfig: () => ({
    width: 21,
    height: 15,
    speedCellsPerSec: 7,
    timeLimitMs: 180_000,
    fogRadius: DEFAULT_FOG_RADIUS,
    doorsPerPlayer: 2,
  }),

  parseConfig(raw, base) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { fogRadius, doorsPerPlayer } = raw as { fogRadius?: unknown; doorsPerPlayer?: unknown };
    const next = { ...base };
    if (fogRadius !== undefined) {
      const ok =
        fogRadius === null ||
        (typeof fogRadius === 'number' &&
          Number.isInteger(fogRadius) &&
          fogRadius >= FOG_RADIUS_RANGE[0] &&
          fogRadius <= FOG_RADIUS_RANGE[1]);
      if (!ok) return null;
      next.fogRadius = fogRadius;
    }
    if (doorsPerPlayer !== undefined) {
      if (!DOORS_OPTIONS.includes(doorsPerPlayer as 2 | 3)) return null;
      next.doorsPerPlayer = doorsPerPlayer as number;
    }
    return next;
  },

  init(seed, _players, config) {
    const maze = generateMaze(seed, config.width, config.height, 0);
    const [x1, y1] = startCell(maze, 'p1');
    const [x2, y2] = startCell(maze, 'p2');
    const exit = exitCell(maze);
    const starts = { p1: y1 * maze.width + x1, p2: y2 * maze.width + x2 };
    const doors = placeDoors(
      maze,
      seed,
      starts,
      exit[1] * maze.width + exit[0],
      config.doorsPerPlayer,
    );
    return {
      seed,
      config,
      maze,
      exit,
      doors,
      players: {
        p1: makePlayer(x1, y1, maze.width),
        p2: makePlayer(x2, y2, maze.width),
      },
      tick: 0,
      elapsedMs: 0,
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
    if (state.result) return;
    const passable = doorPassable(closedEdges(state.doors));
    setQueued(state.maze, state.players[player], input.dir, passable);
  },

  tick(state, dtMs) {
    if (state.result) return;
    state.tick++;
    state.elapsedMs += dtMs;

    const { maze, doors } = state;
    const closed = closedEdges(doors);
    const passable = doorPassable(closed);
    const exit = state.exit[1] * maze.width + state.exit[0];
    const { chunk, count } = substeps(state.config.speedCellsPerSec, dtMs);
    const { p1, p2 } = state.players;
    for (let i = 0; i < count; i++) {
      for (const p of [p1, p2]) {
        const steps = p.steps;
        advance(maze, p, chunk, passable);
        // Подшаг ≤ 0.5 клетки — не больше одного прибытия; клетка прибытия — (x, y).
        if (p.steps === steps) continue;
        const arrived = p.y * maze.width + p.x;
        for (const d of doors) {
          if (d.open || d.plate !== arrived) continue;
          d.open = true;
          d.openedAtMs = state.elapsedMs;
          closed.delete(edgeKey(d.a, d.b));
        }
      }
      if (nearestCell(maze, p1) === exit && nearestCell(maze, p2) === exit) {
        state.result = finish(state, 'escaped');
        return;
      }
    }

    if (state.elapsedMs >= state.config.timeLimitMs) state.result = finish(state, 'timeout');
  },

  result: (state) => state.result,
};
