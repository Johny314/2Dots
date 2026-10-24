import type { MiniGame, PlayerId } from '../../minigame';
import { DELTA, DIRS, OPPOSITE } from '../maze/grid';
import {
  TRAIL_OWNER,
  type CrashCause,
  type Dir,
  type TronConfig,
  type TronInput,
  type TronPlayer,
  type TronResult,
  type TronState,
} from './types';

export * from './types';

/** Начальная скорость, клеток в секунду. */
export const BASE_SPEED = 8;
/** Прибавка скорости при ускорении… */
export const SPEED_STEP = 0.5;
/** …каждые SPEED_STEP_MS. */
export const SPEED_STEP_MS = 5000;
export const MAX_SPEED = 14;
/** Сколько поворотов можно нажать наперёд. */
export const MAX_QUEUE = 2;
/** Отступ стартовой клетки от края (по x) и строка старта p1. */
const START_X = 6;
const START_Y = 14;

/** Скорость (клеток/с) к моменту elapsedMs. */
export function speedAt(config: Pick<TronConfig, 'accelerate'>, elapsedMs: number): number {
  if (!config.accelerate) return BASE_SPEED;
  const steps = Math.floor(Math.max(0, elapsedMs) / SPEED_STEP_MS);
  return Math.min(MAX_SPEED, BASE_SPEED + SPEED_STEP * steps);
}

/** Стартовая клетка и направление: p2 точечно-симметричен p1 относительно центра арены. */
export function startOf(
  config: Pick<TronConfig, 'width' | 'height'>,
  player: PlayerId,
): { x: number; y: number; dir: Dir } {
  const x = Math.min(START_X, config.width - 1);
  const y = Math.min(START_Y, config.height - 1);
  return player === 'p1'
    ? { x, y, dir: 'right' }
    : { x: config.width - 1 - x, y: config.height - 1 - y, dir: 'left' };
}

/** Соседняя клетка по направлению; null — за краем (без сквозных краёв). */
export function nextCell(
  config: Pick<TronConfig, 'width' | 'height' | 'wrap'>,
  x: number,
  y: number,
  dir: Dir,
): [number, number] | null {
  const [dx, dy] = DELTA[dir];
  let nx = x + dx;
  let ny = y + dy;
  if (config.wrap) {
    nx = (nx + config.width) % config.width;
    ny = (ny + config.height) % config.height;
  } else if (nx < 0 || ny < 0 || nx >= config.width || ny >= config.height) {
    return null;
  }
  return [nx, ny];
}

function makePlayer(config: TronConfig, id: PlayerId): TronPlayer {
  const { x, y, dir } = startOf(config, id);
  return { x, y, dir, queue: [], alive: true };
}

function countTrail(trail: readonly number[], owner: number): number {
  let n = 0;
  for (const v of trail) if (v === owner) n++;
  return n;
}

function finish(
  state: TronState,
  reason: TronResult['reason'],
  cause: Record<PlayerId, CrashCause | null>,
): TronResult {
  const { p1, p2 } = state.players;
  const winner: TronResult['winner'] = reason === 'crash' ? (p1.alive ? 'p1' : 'p2') : 'draw';
  const crashAt = (p: TronPlayer): [number, number] | null => (p.alive ? null : [p.x, p.y]);
  return {
    winner,
    reason,
    crash: { p1: crashAt(p1), p2: crashAt(p2) },
    cause,
    lengths: {
      p1: countTrail(state.trail, TRAIL_OWNER.p1),
      p2: countTrail(state.trail, TRAIL_OWNER.p2),
    },
    totalCells: state.config.width * state.config.height,
    durationMs: state.elapsedMs,
  };
}

/**
 * Один шаг на клетку для обоих игроков одновременно. Препятствия — след до шага
 * (головы игроков — тоже след, поэтому обмен клетками ловится как удар в след).
 */
function step(state: TronState): void {
  const { config, trail } = state;
  const ids: PlayerId[] = ['p1', 'p2'];
  const target = {} as Record<PlayerId, [number, number] | null>;
  const cause: Record<PlayerId, CrashCause | null> = { p1: null, p2: null };

  for (const id of ids) {
    const p = state.players[id];
    const turn = p.queue.shift();
    if (turn !== undefined && turn !== OPPOSITE[p.dir]) p.dir = turn;
    const next = nextCell(config, p.x, p.y, p.dir);
    target[id] = next;
    if (next === null) cause[id] = 'wall';
    else if (trail[next[1] * config.width + next[0]] !== 0) cause[id] = 'trail';
  }

  const a = target.p1;
  const b = target.p2;
  const { p1, p2 } = state.players;
  const sameCell = a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
  const swapped =
    a !== null && b !== null && a[0] === p2.x && a[1] === p2.y && b[0] === p1.x && b[1] === p1.y;
  if (sameCell || swapped) {
    cause.p1 = 'head';
    cause.p2 = 'head';
  }

  for (const id of ids) {
    const p = state.players[id];
    const next = target[id];
    if (cause[id] !== null || next === null) {
      p.alive = false;
      continue;
    }
    p.x = next[0];
    p.y = next[1];
    trail[p.y * config.width + p.x] = TRAIL_OWNER[id];
  }

  if (!p1.alive || !p2.alive) {
    state.result = finish(state, p1.alive || p2.alive ? 'crash' : 'both', cause);
  }
}

export const tronGame: MiniGame<TronConfig, TronState, TronInput, TronResult> = {
  id: 'tron',
  title: 'Трон',
  description: 'Оставляй светящийся след и не врезайся. Кто дольше продержится',
  kind: 'versus',
  tickHz: 30,

  defaultConfig: () => ({
    width: 40,
    height: 28,
    accelerate: true,
    wrap: false,
    timeLimitMs: 120_000,
  }),

  parseConfig(raw, base) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { accelerate, wrap } = raw as { accelerate?: unknown; wrap?: unknown };
    const next = { ...base };
    if (accelerate !== undefined) {
      if (typeof accelerate !== 'boolean') return null;
      next.accelerate = accelerate;
    }
    if (wrap !== undefined) {
      if (typeof wrap !== 'boolean') return null;
      next.wrap = wrap;
    }
    return next;
  },

  init(seed, _players, config) {
    const trail = new Array<number>(config.width * config.height).fill(0);
    const players = { p1: makePlayer(config, 'p1'), p2: makePlayer(config, 'p2') };
    for (const id of ['p1', 'p2'] as const) {
      const p = players[id];
      trail[p.y * config.width + p.x] = TRAIL_OWNER[id];
    }
    return {
      seed,
      config,
      tick: 0,
      elapsedMs: 0,
      progress: 0,
      trail,
      players,
      result: null,
    };
  },

  parseInput(raw) {
    if (typeof raw !== 'object' || raw === null || !('dir' in raw)) return null;
    const dir = (raw as { dir: unknown }).dir;
    if (dir === null || DIRS.includes(dir as Dir)) return { dir: dir as Dir | null };
    return null;
  },

  applyInput(state, player, input) {
    const p = state.players[player];
    if (state.result || !p.alive || input.dir === null) return;
    // Сравниваем с последним запланированным направлением: повтор и разворот на 180° — мимо.
    const last = p.queue[p.queue.length - 1] ?? p.dir;
    if (input.dir === last || input.dir === OPPOSITE[last]) return;
    if (p.queue.length >= MAX_QUEUE) return;
    p.queue.push(input.dir);
  },

  tick(state, dtMs) {
    if (state.result) return;
    state.tick++;
    state.progress += (speedAt(state.config, state.elapsedMs) * dtMs) / 1000;
    state.elapsedMs += dtMs;
    while (state.progress >= 1) {
      state.progress -= 1;
      step(state);
      if (state.result) {
        state.progress = 0;
        return;
      }
    }
    if (state.elapsedMs >= state.config.timeLimitMs) {
      state.result = finish(state, 'timeout', { p1: null, p2: null });
    }
  },

  result: (state) => state.result,
};
