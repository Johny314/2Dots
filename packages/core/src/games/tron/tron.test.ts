import { describe, expect, it } from 'vitest';
import { PLAYER_IDS, type PlayerId } from '../../minigame';
import { Rng } from '../../rng';
import { DIRS, OPPOSITE } from '../maze/grid';
import {
  BASE_SPEED,
  MAX_SPEED,
  TRAIL_OWNER,
  nextCell,
  speedAt,
  startOf,
  tronGame,
  type Dir,
  type TronConfig,
  type TronState,
} from './index';

const DT = 1000 / tronGame.tickHz;
/** Без ускорения один tick длиной STEP_MS — ровно один шаг на клетку. */
const STEP_MS = 1000 / BASE_SPEED;

function make(overrides: Partial<TronConfig> = {}, seed = 1): TronState {
  return tronGame.init(seed, PLAYER_IDS, {
    ...tronGame.defaultConfig(),
    accelerate: false,
    ...overrides,
  });
}

/** Ставит игрока в клетку (x, y) лицом в dir и помечает клетку его следом. */
function place(s: TronState, id: PlayerId, x: number, y: number, dir: Dir): void {
  const old = s.players[id];
  s.trail[old.y * s.config.width + old.x] = 0;
  Object.assign(s.players[id], { x, y, dir, queue: [] });
  s.trail[y * s.config.width + x] = TRAIL_OWNER[id];
}

function steps(s: TronState, n: number): void {
  for (let i = 0; i < n && !s.result; i++) tronGame.tick(s, STEP_MS);
}

const input = (s: TronState, id: PlayerId, dir: Dir | null) => tronGame.applyInput(s, id, { dir });

describe('tron: старт', () => {
  it('p1 слева лицом вправо, p2 точечно-симметричен, стартовые клетки — след', () => {
    const s = make();
    expect(s.players.p1).toEqual({ x: 6, y: 14, dir: 'right', queue: [], alive: true });
    expect(s.players.p2).toEqual({ x: 33, y: 13, dir: 'left', queue: [], alive: true });
    expect(s.trail).toHaveLength(40 * 28);
    expect(s.trail[14 * 40 + 6]).toBe(1);
    expect(s.trail[13 * 40 + 33]).toBe(2);
    expect(s.trail.filter((v) => v !== 0)).toHaveLength(2);
    expect(startOf({ width: 40, height: 28 }, 'p2')).toEqual({ x: 33, y: 13, dir: 'left' });
  });

  it('state и result переживают JSON', () => {
    const s = make();
    input(s, 'p2', 'up');
    steps(s, 5);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    steps(s, 1000);
    expect(s.result).not.toBeNull();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('tron: столкновения', () => {
  it('прямо в стену: p2 сворачивает вверх и врезается в верхний край, p1 побеждает', () => {
    const s = make();
    input(s, 'p2', 'up');
    steps(s, 13);
    expect(s.result).toBeNull();
    expect(s.players.p2).toMatchObject({ x: 33, y: 0, dir: 'up', alive: true });
    steps(s, 1);
    expect(s.result).toEqual({
      winner: 'p1',
      reason: 'crash',
      crash: { p1: null, p2: [33, 0] },
      cause: { p1: null, p2: 'wall' },
      lengths: { p1: 15, p2: 14 },
      totalCells: 40 * 28,
      durationMs: 14 * STEP_MS,
    });
    // Победитель тоже сделал этот шаг.
    expect(s.players.p1).toMatchObject({ x: 20, y: 14, alive: true });
  });

  it('оба прямо в стены на одном шаге — ничья', () => {
    const s = make();
    steps(s, 100);
    expect(s.result).toMatchObject({
      winner: 'draw',
      reason: 'both',
      crash: { p1: [39, 14], p2: [0, 13] },
      cause: { p1: 'wall', p2: 'wall' },
    });
  });

  it('в след (свой или чужой) — проигрыш', () => {
    const s = make();
    s.trail[14 * 40 + 9] = TRAIL_OWNER.p2;
    input(s, 'p2', 'up');
    steps(s, 3);
    expect(s.result).toMatchObject({
      winner: 'p2',
      reason: 'crash',
      crash: { p1: [8, 14], p2: null },
      cause: { p1: 'trail', p2: null },
    });

    // Свой след: квадрат вправо-вниз-влево-вверх.
    const t = make({ width: 20, height: 20 });
    place(t, 'p1', 5, 5, 'right');
    place(t, 'p2', 15, 15, 'up');
    steps(t, 1);
    input(t, 'p1', 'down');
    steps(t, 1);
    input(t, 'p1', 'left');
    steps(t, 1);
    input(t, 'p1', 'up');
    steps(t, 1);
    expect(t.result).toMatchObject({ winner: 'p2', cause: { p1: 'trail', p2: null } });
  });

  it('лоб в лоб с обменом клетками — оба разбиты, ничья', () => {
    const s = make();
    place(s, 'p1', 10, 5, 'right');
    place(s, 'p2', 11, 5, 'left');
    steps(s, 1);
    expect(s.result).toMatchObject({
      winner: 'draw',
      reason: 'both',
      crash: { p1: [10, 5], p2: [11, 5] },
      cause: { p1: 'head', p2: 'head' },
    });
  });

  it('оба въезжают в одну клетку — ничья, клетка остаётся пустой', () => {
    const s = make();
    place(s, 'p1', 10, 5, 'right');
    place(s, 'p2', 11, 4, 'down');
    steps(s, 1);
    expect(s.result).toMatchObject({
      winner: 'draw',
      reason: 'both',
      cause: { p1: 'head', p2: 'head' },
    });
    expect(s.trail[5 * 40 + 11]).toBe(0);
  });

  it('один врезается в голову другого, пока тот уходит — это удар в след', () => {
    const s = make();
    place(s, 'p1', 10, 5, 'right');
    place(s, 'p2', 11, 5, 'up');
    steps(s, 1);
    expect(s.result).toMatchObject({ winner: 'p2', cause: { p1: 'trail', p2: null } });
  });
});

describe('tron: управление', () => {
  it('разворот на 180° и повтор направления игнорируются, null — без изменений', () => {
    const s = make();
    input(s, 'p1', 'left');
    input(s, 'p1', 'right');
    input(s, 'p1', null);
    expect(s.players.p1.queue).toEqual([]);
    steps(s, 1);
    expect(s.players.p1).toMatchObject({ x: 7, y: 14, dir: 'right' });
  });

  it('очередь поворотов: «вверх, затем влево» применяются на соседних шагах', () => {
    const s = make();
    input(s, 'p1', 'up');
    input(s, 'p1', 'down'); // разворот относительно запланированного «вверх»
    input(s, 'p1', 'left');
    input(s, 'p1', 'down'); // очередь полна
    expect(s.players.p1.queue).toEqual(['up', 'left']);
    steps(s, 1);
    expect(s.players.p1).toMatchObject({ x: 6, y: 13, dir: 'up' });
    steps(s, 1);
    expect(s.players.p1).toMatchObject({ x: 5, y: 13, dir: 'left', queue: [] });
  });

  it('поворот ждёт следующего шага, а не применяется посреди клетки', () => {
    const s = make();
    tronGame.tick(s, STEP_MS / 2);
    input(s, 'p1', 'down');
    expect(s.players.p1).toMatchObject({ x: 6, y: 14, dir: 'right' });
    tronGame.tick(s, STEP_MS / 2);
    expect(s.players.p1).toMatchObject({ x: 6, y: 15, dir: 'down' });
  });

  it('ввод после конца раунда и от разбитого игрока игнорируется', () => {
    const s = make();
    steps(s, 100);
    input(s, 'p1', 'up');
    expect(s.players.p1.queue).toEqual([]);
  });
});

describe('tron: правила', () => {
  it('сквозные края: выход вправо — появление слева', () => {
    const s = make({ wrap: true });
    place(s, 'p1', 39, 3, 'right');
    steps(s, 1);
    expect(s.result).toBeNull();
    expect(s.players.p1).toMatchObject({ x: 0, y: 3 });
    expect(s.trail[3 * 40]).toBe(1);
    expect(nextCell({ width: 5, height: 5, wrap: true }, 2, 0, 'up')).toEqual([2, 4]);
    expect(nextCell({ width: 5, height: 5, wrap: false }, 2, 0, 'up')).toBeNull();

    const t = make({ wrap: false });
    place(t, 'p1', 39, 3, 'right');
    steps(t, 1);
    expect(t.result).toMatchObject({ winner: 'p2', cause: { p1: 'wall' } });
  });

  it('ускорение: +0.5 клетки/с каждые 5 с, не выше 14', () => {
    const on = { accelerate: true };
    expect(speedAt(on, 0)).toBe(8);
    expect(speedAt(on, 4999)).toBe(8);
    expect(speedAt(on, 5000)).toBe(8.5);
    expect(speedAt(on, 30_000)).toBe(11);
    expect(speedAt(on, 60_000)).toBe(MAX_SPEED);
    expect(speedAt(on, 1e9)).toBe(MAX_SPEED);
    expect(speedAt({ accelerate: false }, 60_000)).toBe(BASE_SPEED);

    // Длинная арена, 10 секунд по прямой: 40 + 42.5 клеток против 80.
    const run = (accelerate: boolean) => {
      const s = make({ width: 400, accelerate });
      for (let i = 0; i < 301; i++) tronGame.tick(s, DT);
      expect(s.result).toBeNull();
      return s.players.p1.x - 6;
    };
    expect(run(false)).toBe(80);
    expect(run(true)).toBe(82);
  });

  it('время вышло — ничья', () => {
    const s = make({ width: 400, timeLimitMs: 1000 });
    for (let i = 0; i < 40 && !s.result; i++) tronGame.tick(s, DT);
    expect(s.result).toMatchObject({
      winner: 'draw',
      reason: 'timeout',
      crash: { p1: null, p2: null },
      cause: { p1: null, p2: null },
      lengths: { p1: 9, p2: 9 },
    });
  });

  it('большой dt: шаги всё равно по одной клетке, столкновения не пропускаются', () => {
    const s = make();
    place(s, 'p1', 10, 5, 'right');
    place(s, 'p2', 20, 5, 'left');
    tronGame.tick(s, 10_000);
    expect(s.result).toMatchObject({ winner: 'draw', reason: 'both' });
  });
});

describe('tron: parseConfig / parseInput', () => {
  const base = tronGame.defaultConfig();

  it('хост меняет только accelerate и wrap', () => {
    expect(tronGame.parseConfig({ accelerate: false }, base)).toEqual({
      ...base,
      accelerate: false,
    });
    expect(tronGame.parseConfig({ wrap: true, width: 5, timeLimitMs: 1 }, base)).toEqual({
      ...base,
      wrap: true,
    });
    expect(tronGame.parseConfig({}, base)).toEqual(base);
  });

  it('мусор отклоняется', () => {
    for (const raw of [null, 1, 'x', { accelerate: 'yes' }, { wrap: 1 }, { wrap: null }]) {
      expect(tronGame.parseConfig(raw, base), JSON.stringify(raw)).toBeNull();
    }
  });

  it('parseInput: направление или null', () => {
    for (const dir of [...DIRS, null]) expect(tronGame.parseInput({ dir })).toEqual({ dir });
    for (const raw of [null, {}, { dir: 'north' }, { dir: 1 }, 'up', []]) {
      expect(tronGame.parseInput(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('tron: детерминизм и симуляция', () => {
  /** Жадный бот: держит направление, пока впереди свободно, иногда сворачивает. */
  function botDir(s: TronState, id: PlayerId, rng: Rng): Dir | null {
    const p = s.players[id];
    const free = (d: Dir) => {
      if (d === OPPOSITE[p.dir]) return false;
      const n = nextCell(s.config, p.x, p.y, d);
      return n !== null && s.trail[n[1] * s.config.width + n[0]] === 0;
    };
    const options = DIRS.filter(free);
    if (options.length === 0) return null;
    if (free(p.dir) && rng.next() > 0.08) return null;
    return rng.pick(options);
  }

  function play(seed: number, config: Partial<TronConfig>): TronState {
    const s = make(config, seed);
    const rng = new Rng(seed);
    const maxTicks = Math.ceil(s.config.timeLimitMs / DT) + 2;
    for (let i = 0; i < maxTicks && !tronGame.result(s); i++) {
      for (const id of PLAYER_IDS) {
        const dir = botDir(s, id, rng);
        const parsed = tronGame.parseInput({ dir });
        if (parsed) tronGame.applyInput(s, id, parsed);
      }
      tronGame.tick(s, DT);
    }
    return s;
  }

  it('одинаковый seed и ввод — одинаковый ход игры', () => {
    for (const seed of [1, 7, 42]) {
      const a = play(seed, { accelerate: true });
      const b = play(seed, { accelerate: true });
      expect(a).toEqual(b);
      expect(a.result).not.toBeNull();
    }
  });

  it('120 раундов ботов на разных настройках всегда заканчиваются корректным результатом', () => {
    const configs: Partial<TronConfig>[] = [
      {},
      { accelerate: true },
      { wrap: true },
      { accelerate: true, wrap: true },
      { width: 12, height: 9 },
      { width: 60, height: 20, accelerate: true },
    ];
    const winners = { p1: 0, p2: 0, draw: 0 };
    for (let seed = 1; seed <= 120; seed++) {
      const s = play(seed, configs[seed % configs.length] as Partial<TronConfig>);
      const r = s.result;
      expect(r, `seed ${seed}`).not.toBeNull();
      if (!r) continue;
      winners[r.winner]++;
      expect(['crash', 'both', 'timeout']).toContain(r.reason);
      expect(r.durationMs).toBeLessThanOrEqual(s.config.timeLimitMs);
      for (const id of PLAYER_IDS) {
        const owned = s.trail.filter((v) => v === TRAIL_OWNER[id]).length;
        expect(r.lengths[id]).toBe(owned);
        expect(r.crash[id] === null).toBe(s.players[id].alive);
        expect(r.cause[id] === null).toBe(s.players[id].alive);
      }
      if (r.reason === 'crash') {
        expect(s.players[r.winner as PlayerId].alive).toBe(true);
      } else {
        expect(r.winner).toBe('draw');
      }
    }
    // Боты разные по силе от раунда к раунду: побеждают оба.
    expect(winners.p1).toBeGreaterThan(0);
    expect(winners.p2).toBeGreaterThan(0);
  });
});
