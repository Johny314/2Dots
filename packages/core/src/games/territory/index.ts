// «Территория»: закрась лабиринт своим цветом. Движение — как в лабиринте (games/maze),
// клетка, в которую игрок вошёл, становится его (в том числе чужая). Встречи нет —
// игроки проходят друг сквозь друга. По истечении времени больше клеток — победа.
import type { MiniGame, PlayerId } from '../../minigame';
import { generateMaze } from '../maze/generate';
import { DIRS } from '../maze/grid';
import { advance, makePlayer, startCell, substeps } from '../maze/movement';
import type { Dir } from '../maze/types';
import type {
  CellOwner,
  TerritoryConfig,
  TerritoryInput,
  TerritoryResult,
  TerritoryState,
} from './types';

export * from './types';

/** Радиус тумана, когда хост его включает. */
export const DEFAULT_FOG_RADIUS = 3;
/** Допустимые радиусы тумана в настройках. */
export const FOG_RADIUS_RANGE = [1, 8] as const;
/** Допустимые длительности раунда. */
export const TIME_LIMITS_MS = [60_000, 90_000, 150_000] as const;
export const DEFAULT_TIME_LIMIT_MS = 90_000;
export const LONG_TIME_LIMIT_MS = 150_000;

export const OWNER_CODE: Readonly<Record<PlayerId, CellOwner>> = { p1: 1, p2: 2 };

/** Код владельца → игрок (0 — никто). */
export function ownerId(code: number): PlayerId | null {
  return code === 1 ? 'p1' : code === 2 ? 'p2' : null;
}

/** Пересчёт клеток каждого игрока по owner[] (для проверок и тестов). */
export function countOwned(owner: readonly number[]): Record<PlayerId, number> {
  const counts = { p1: 0, p2: 0 };
  for (const o of owner) {
    if (o === 1) counts.p1++;
    else if (o === 2) counts.p2++;
  }
  return counts;
}

/** Закрашивает клетку цветом игрока (перекрашивает чужую), поддерживая counts. */
function paint(state: TerritoryState, player: PlayerId, cell: number): void {
  const code = OWNER_CODE[player];
  const prev = ownerId(state.owner[cell] ?? 0);
  if (prev === player) return;
  if (prev) state.counts[prev]--;
  state.owner[cell] = code;
  state.counts[player]++;
}

function finish(state: TerritoryState): TerritoryResult {
  const scores = { ...state.counts };
  const winner: TerritoryResult['winner'] =
    scores.p1 === scores.p2 ? 'draw' : scores.p1 > scores.p2 ? 'p1' : 'p2';
  return {
    winner,
    reason: 'timeout',
    scores,
    totalCells: state.maze.width * state.maze.height,
  };
}

const isFogRadius = (v: unknown): v is number | null =>
  v === null ||
  (typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= FOG_RADIUS_RANGE[0] &&
    v <= FOG_RADIUS_RANGE[1]);

export const territoryGame: MiniGame<
  TerritoryConfig,
  TerritoryState,
  TerritoryInput,
  TerritoryResult
> = {
  id: 'territory',
  title: 'Территория',
  description: 'Закрась лабиринт своим цветом. Чужие клетки можно перекрашивать',
  kind: 'versus',
  tickHz: 30,

  defaultConfig: () => ({
    width: 21,
    height: 15,
    braid: 0.35,
    speedCellsPerSec: 7,
    timeLimitMs: DEFAULT_TIME_LIMIT_MS,
    fogRadius: null,
  }),

  parseConfig(raw, base) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { fogRadius, timeLimitMs } = raw as { fogRadius?: unknown; timeLimitMs?: unknown };
    const next = { ...base };
    if (fogRadius !== undefined) {
      if (!isFogRadius(fogRadius)) return null;
      next.fogRadius = fogRadius;
    }
    if (timeLimitMs !== undefined) {
      if (!TIME_LIMITS_MS.includes(timeLimitMs as (typeof TIME_LIMITS_MS)[number])) return null;
      next.timeLimitMs = timeLimitMs as number;
    }
    return next;
  },

  init(seed, _players, config) {
    const maze = generateMaze(seed, config.width, config.height, config.braid);
    const [x1, y1] = startCell(maze, 'p1');
    const [x2, y2] = startCell(maze, 'p2');
    const state: TerritoryState = {
      seed,
      config,
      maze,
      tick: 0,
      elapsedMs: 0,
      players: {
        p1: makePlayer(x1, y1, maze.width),
        p2: makePlayer(x2, y2, maze.width),
      },
      owner: new Array<number>(maze.width * maze.height).fill(0),
      counts: { p1: 0, p2: 0 },
      result: null,
    };
    // Стартовые клетки уже свои.
    paint(state, 'p1', y1 * maze.width + x1);
    paint(state, 'p2', y2 * maze.width + x2);
    return state;
  },

  parseInput(raw) {
    if (typeof raw !== 'object' || raw === null || !('dir' in raw)) return null;
    const dir = (raw as { dir: unknown }).dir;
    if (dir === null || DIRS.includes(dir as Dir)) return { dir: dir as Dir | null };
    return null;
  },

  applyInput(state, player, input) {
    if (state.result) return;
    state.players[player].queued = input.dir;
  },

  tick(state, dtMs) {
    if (state.result) return;
    state.tick++;
    state.elapsedMs += dtMs;

    // Подшаг ≤ MAX_SUBSTEP_CELLS < 1 клетки: за один advance игрок входит не более чем в одну
    // клетку. Красим по приросту steps (не по смене x/y: мгновенный разворот переносит x/y
    // в ещё не достигнутую клетку без шага). p1 ходит первым — при одновременном входе
    // в одну клетку она достаётся p2.
    const { chunk, count } = substeps(state.config.speedCellsPerSec, dtMs);
    const { width } = state.maze;
    for (let i = 0; i < count; i++) {
      for (const id of ['p1', 'p2'] as const) {
        const p = state.players[id];
        const before = p.steps;
        advance(state.maze, p, chunk);
        if (p.steps !== before) paint(state, id, p.y * width + p.x);
      }
    }

    if (state.elapsedMs >= state.config.timeLimitMs) state.result = finish(state);
  },

  result: (state) => state.result,
};
