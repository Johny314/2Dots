// «Прятки»: один прячется, другой ищет. Движение — как в лабиринте (games/maze).
// Прячущийся получает фору (искатель стоит), за ним тянется след, который видит искатель;
// замер на trailFadeMs — след пропадает. Искатель может попросить подсказку: на hintMs
// подсвечивается область, где прячущийся. Встреча до конца времени — победа искателя.
import type { MiniGame, PlayerId } from '../../minigame';
import { Rng } from '../../rng';
import { generateMaze } from '../maze/generate';
import { DIRS } from '../maze/grid';
import { advance, haveMet, makePlayer, setQueued, startCell, substeps } from '../maze/movement';
import type { Dir } from '../maze/types';
import type { HideConfig, HideInput, HideResult, HideRoles, HideState } from './types';

export * from './types';

export const DEFAULT_FOG_RADIUS = 3;
export const HEAD_START_MS = 10_000;
export const HINTS = 3;
export const HINT_MS = 1500;
/** Подсказка — квадрат 5×5 клеток. */
export const HINT_RADIUS = 2;
export const TRAIL_FADE_MS = 3000;
/** Сколько последних клеток прячущегося видит искатель. */
export const TRAIL_LENGTH = 14;

const ROLES: readonly HideRoles[] = ['random', 'p1', 'p2'];

export const other = (id: PlayerId): PlayerId => (id === 'p1' ? 'p2' : 'p1');

/** Кто прячется в раунде с этим seed. */
export function hiderOf(seed: number, roles: HideRoles): PlayerId {
  if (roles !== 'random') return roles;
  return new Rng(seed ^ 0x6869_6465).next() < 0.5 ? 'p1' : 'p2';
}

/** Фора идёт: искатель ещё стоит. */
export const isHeadStart = (state: Pick<HideState, 'elapsedMs' | 'config'>): boolean =>
  state.elapsedMs < state.config.headStartMs;

function finish(state: HideState, reason: HideResult['reason']): HideResult {
  const seeker = other(state.hider);
  const p = state.players[state.hider];
  return {
    winner: reason === 'found' ? seeker : state.hider,
    reason,
    hider: state.hider,
    timeMs: state.elapsedMs,
    headStartMs: state.config.headStartMs,
    timeLimitMs: state.config.timeLimitMs,
    hintsUsed: state.config.hints - state.hintsLeft,
    foundCell: reason === 'found' ? [p.x, p.y] : null,
  };
}

/**
 * Подсказка: квадрат вокруг прячущегося, центр сдвинут на клетку-другую (детерминированно
 * от seed и номера подсказки) — область, а не точное место.
 */
function giveHint(state: HideState): void {
  const { maze, config } = state;
  const p = state.players[state.hider];
  const used = config.hints - state.hintsLeft;
  const rng = new Rng(state.seed + 7919 * (used + 1));
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  state.hintsLeft--;
  state.hint = {
    x: clamp(p.x + rng.int(3) - 1, maze.width),
    y: clamp(p.y + rng.int(3) - 1, maze.height),
    radius: HINT_RADIUS,
    untilMs: state.elapsedMs + config.hintMs,
  };
}

export const hideGame: MiniGame<HideConfig, HideState, HideInput, HideResult> = {
  id: 'hide',
  title: 'Прятки',
  description: 'Один прячется, другой ищет. Замри — и твой след пропадёт',
  kind: 'versus',
  tickHz: 30,

  defaultConfig: () => ({
    width: 21,
    height: 15,
    braid: 0.25,
    speedCellsPerSec: 7,
    fogRadius: DEFAULT_FOG_RADIUS,
    hotCold: true,
    roles: 'random',
    timeLimitMs: 120_000,
    headStartMs: HEAD_START_MS,
    hints: HINTS,
    hintMs: HINT_MS,
    trailFadeMs: TRAIL_FADE_MS,
  }),

  parseConfig(raw, base) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { hotCold, roles } = raw as { hotCold?: unknown; roles?: unknown };
    const next = { ...base };
    if (hotCold !== undefined) {
      if (typeof hotCold !== 'boolean') return null;
      next.hotCold = hotCold;
    }
    if (roles !== undefined) {
      if (!ROLES.includes(roles as HideRoles)) return null;
      next.roles = roles as HideRoles;
    }
    return next;
  },

  init(seed, _players, config) {
    const maze = generateMaze(seed, config.width, config.height, config.braid);
    const hider = hiderOf(seed, config.roles);
    const seeker = other(hider);
    // Прячущийся — в центре, искатель — в своём углу.
    const hx = Math.floor(maze.width / 2);
    const hy = Math.floor(maze.height / 2);
    const [sx, sy] = startCell(maze, seeker);
    const players = {} as HideState['players'];
    players[hider] = makePlayer(hx, hy, maze.width);
    players[seeker] = makePlayer(sx, sy, maze.width);
    return {
      seed,
      config,
      maze,
      tick: 0,
      elapsedMs: 0,
      hider,
      players,
      trail: [hy * maze.width + hx],
      stillMs: 0,
      hintsLeft: config.hints,
      hint: null,
      result: null,
    };
  },

  parseInput(raw) {
    if (typeof raw !== 'object' || raw === null || !('dir' in raw)) return null;
    const { dir, hint } = raw as { dir: unknown; hint?: unknown };
    if (dir !== null && !DIRS.includes(dir as Dir)) return null;
    if (hint !== undefined && typeof hint !== 'boolean') return null;
    return hint ? { dir: dir as Dir | null, hint: true } : { dir: dir as Dir | null };
  },

  applyInput(state, player, input) {
    if (state.result) return;
    setQueued(state.maze, state.players[player], input.dir);
    if (!input.hint || player === state.hider || isHeadStart(state)) return;
    if (state.hintsLeft <= 0 || state.hint !== null) return;
    giveHint(state);
  },

  tick(state, dtMs) {
    if (state.result) return;
    state.tick++;
    // Искатель стоит, пока идёт фора (решаем по времени до тика: фора — целое число тиков).
    const seekerFree = !isHeadStart(state);
    state.elapsedMs += dtMs;

    const { maze } = state;
    const hider = state.players[state.hider];
    const seeker = state.players[other(state.hider)];
    const before = { steps: hider.steps, progress: hider.moveProgress, x: hider.x, y: hider.y };
    const { chunk, count } = substeps(state.config.speedCellsPerSec, dtMs);
    for (let i = 0; i < count; i++) {
      const steps = hider.steps;
      advance(maze, hider, chunk);
      if (hider.steps !== steps) {
        const cell = hider.y * maze.width + hider.x;
        if (state.trail[state.trail.length - 1] !== cell) state.trail.push(cell);
        if (state.trail.length > TRAIL_LENGTH) state.trail.shift();
      }
      if (seekerFree) {
        advance(maze, seeker, chunk);
        if (haveMet(maze, hider, seeker)) {
          state.result = finish(state, 'found');
          return;
        }
      }
    }

    // Замер на месте — след пропадает.
    const moved =
      hider.steps !== before.steps ||
      hider.moveProgress !== before.progress ||
      hider.x !== before.x ||
      hider.y !== before.y;
    state.stillMs = moved ? 0 : state.stillMs + dtMs;
    if (state.stillMs >= state.config.trailFadeMs) state.trail = [];

    if (state.hint && state.elapsedMs >= state.hint.untilMs) state.hint = null;
    if (state.elapsedMs >= state.config.timeLimitMs) state.result = finish(state, 'timeout');
  },

  result: (state) => state.result,
};
