import { describe, expect, it } from 'vitest';
import { getGame } from '../../registry';
import { bfsDistances, canMove, DELTA, DIRS } from '../maze/grid';
import type { Dir, MazePlayer } from '../maze/types';
import {
  HINT_RADIUS,
  hideGame as game,
  hiderOf,
  other,
  type HideConfig,
  type HideState,
} from './index';

const DT = 1000 / game.tickHz;

function setup(overrides: Partial<HideConfig> = {}, seed = 1): HideState {
  return game.init(seed, ['p1', 'p2'], { ...game.defaultConfig(), ...overrides });
}

function runMs(s: HideState, ms: number): void {
  for (let t = 0; t < ms && !s.result; t += DT) game.tick(s, DT);
}

/** Направление по кратчайшему пути из клетки, в которую игрок сейчас входит. */
function chase(s: HideState, me: MazePlayer, target: MazePlayer): Dir | null {
  const [dx, dy] = me.moveProgress > 0.3 && me.dir ? DELTA[me.dir] : [0, 0];
  const x = me.x + dx;
  const y = me.y + dy;
  const dist = bfsDistances(s.maze, target.x, target.y);
  const here = dist[y * s.maze.width + x] as number;
  for (const dir of DIRS) {
    if (!canMove(s.maze, x, y, dir)) continue;
    const [ex, ey] = DELTA[dir];
    if (dist[(y + ey) * s.maze.width + x + ex] === here - 1) return dir;
  }
  return me.dir;
}

describe('hide: роли и старт', () => {
  it('зарегистрирована в реестре', () => {
    expect(getGame('hide')).toBe(game);
  });

  it('роль задаёт хост; random — детерминированно по seed и даёт обе роли', () => {
    expect(hiderOf(5, 'p1')).toBe('p1');
    expect(hiderOf(5, 'p2')).toBe('p2');
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      expect(hiderOf(seed, 'random')).toBe(hiderOf(seed, 'random'));
      seen.add(hiderOf(seed, 'random'));
    }
    expect([...seen].sort()).toEqual(['p1', 'p2']);
  });

  it('прячущийся — в центре, искатель — в своём углу', () => {
    const s = setup({ roles: 'p2' });
    expect(s.hider).toBe('p2');
    expect(s.players.p2).toMatchObject({ x: 10, y: 7 });
    expect(s.players.p1).toMatchObject({ x: 0, y: 0 });
    const t = setup({ roles: 'p1' });
    expect(t.players.p2).toMatchObject({ x: 20, y: 14 });
  });

  it('хост меняет только роли и «горячо-холодно»', () => {
    const base = game.defaultConfig();
    expect(game.parseConfig({ roles: 'p1', hotCold: false }, base)).toMatchObject({
      roles: 'p1',
      hotCold: false,
    });
    expect(game.parseConfig({ roles: 'both' }, base)).toBeNull();
    expect(game.parseConfig({ hotCold: 1 }, base)).toBeNull();
    expect(game.parseConfig({ headStartMs: 0, hints: 99 }, base)).toEqual(base);
  });

  it('проверяет ввод', () => {
    expect(game.parseInput({ dir: 'up' })).toEqual({ dir: 'up' });
    expect(game.parseInput({ dir: null, hint: true })).toEqual({ dir: null, hint: true });
    expect(game.parseInput({ dir: 'up', hint: false })).toEqual({ dir: 'up' });
    expect(game.parseInput({ dir: 'north' })).toBeNull();
    expect(game.parseInput({ dir: null, hint: 'yes' })).toBeNull();
  });
});

describe('hide: фора, след и подсказки', () => {
  it('во время форы искатель стоит, прячущийся ходит', () => {
    const s = setup({ roles: 'p2' });
    game.applyInput(s, 'p1', { dir: 'right' });
    game.applyInput(s, 'p1', { dir: 'down' });
    const h = s.players.p2;
    const dir = DIRS.find((d) => canMove(s.maze, h.x, h.y, d)) as Dir;
    game.applyInput(s, 'p2', { dir });
    runMs(s, 2000);
    expect(s.players.p1).toMatchObject({ x: 0, y: 0, steps: 0 });
    expect(s.players.p2.steps).toBeGreaterThan(0);
    runMs(s, s.config.headStartMs);
    expect(s.players.p1.steps).toBeGreaterThan(0);
  });

  it('след растёт при движении и пропадает, если прячущийся замер', () => {
    const s = setup({ roles: 'p1' });
    const h = s.players.p1;
    const dir = DIRS.find((d) => canMove(s.maze, h.x, h.y, d)) as Dir;
    game.applyInput(s, 'p1', { dir });
    runMs(s, 200);
    game.applyInput(s, 'p1', { dir: null });
    runMs(s, 300);
    expect(s.trail.length).toBeGreaterThan(1);
    expect(s.trail[s.trail.length - 1]).toBe(h.y * s.maze.width + h.x);
    runMs(s, s.config.trailFadeMs - 500);
    expect(s.trail.length).toBeGreaterThan(1);
    runMs(s, 600);
    expect(s.trail).toEqual([]);
    expect(s.stillMs).toBeGreaterThanOrEqual(s.config.trailFadeMs);
  });

  it('подсказки: только искателю, после форы, по одной и не больше лимита', () => {
    const s = setup({ roles: 'p1' });
    game.applyInput(s, 'p2', { dir: null, hint: true });
    expect(s.hint).toBeNull(); // фора
    runMs(s, s.config.headStartMs + DT);
    game.applyInput(s, 'p1', { dir: null, hint: true });
    expect(s.hint).toBeNull(); // прячущемуся нельзя
    game.applyInput(s, 'p2', { dir: null, hint: true });
    const hint = s.hint;
    expect(hint).not.toBeNull();
    if (!hint) return;
    expect(s.hintsLeft).toBe(s.config.hints - 1);
    // Прячущийся — внутри подсвеченной области.
    const h = s.players.p1;
    expect(Math.abs(h.x - hint.x)).toBeLessThanOrEqual(HINT_RADIUS);
    expect(Math.abs(h.y - hint.y)).toBeLessThanOrEqual(HINT_RADIUS);
    game.applyInput(s, 'p2', { dir: null, hint: true });
    expect(s.hintsLeft).toBe(s.config.hints - 1); // пока горит — новой нет
    runMs(s, s.config.hintMs + DT);
    expect(s.hint).toBeNull();
    for (let i = 0; i < 5; i++) {
      game.applyInput(s, 'p2', { dir: null, hint: true });
      runMs(s, s.config.hintMs + DT);
    }
    expect(s.hintsLeft).toBe(0);
  });
});

describe('hide: итог', () => {
  it('не нашёл до конца времени — победа прячущегося', () => {
    const s = setup({ roles: 'p2', timeLimitMs: 15_000 });
    runMs(s, 20_000);
    expect(s.result).toMatchObject({
      winner: 'p2',
      reason: 'timeout',
      hider: 'p2',
      foundCell: null,
      hintsUsed: 0,
    });
  });

  it('искатель-бот находит стоящего прячущегося — победа искателя', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup({}, seed);
      const seeker = other(s.hider);
      let guard = 0;
      while (!s.result && guard++ < 10_000) {
        const me = s.players[seeker];
        game.applyInput(s, seeker, { dir: chase(s, me, s.players[s.hider]) });
        game.tick(s, DT);
      }
      expect(s.result, `seed ${seed}`).toMatchObject({ winner: seeker, reason: 'found' });
      const r = s.result;
      expect(r?.timeMs).toBeGreaterThan(s.config.headStartMs);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });

  it('встреча во время форы не считается', () => {
    const s = setup({ roles: 'p2' });
    // Прячущегося ставим вплотную к искателю: пока фора — раунд идёт.
    s.players.p2 = { ...s.players.p1, visited: [0] };
    runMs(s, 1000);
    expect(s.result).toBeNull();
    runMs(s, s.config.headStartMs);
    expect(s.result).toMatchObject({ winner: 'p1', reason: 'found' });
  });
});
