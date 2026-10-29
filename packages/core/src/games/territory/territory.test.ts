import { describe, expect, it } from 'vitest';
import { getGame } from '../../registry';
import { Rng } from '../../rng';
import { DELTA, DIRS, OPPOSITE, bfsDistances, canMove } from '../maze/grid';
import { LATE_TURN_WINDOW } from '../maze/movement';
import { WALL, type Dir, type Maze, type MazePlayer } from '../maze/types';
import {
  countOwned,
  territoryGame,
  type TerritoryConfig,
  type TerritoryResult,
  type TerritoryState,
} from './index';

const game = territoryGame;
const DT = 1000 / game.tickHz;
/** Тиков на одну клетку при 7 клетках/с и 30 Гц — с запасом. */
const TICKS_PER_CELL = 5;

/** Лабиринт из одних стен с прорезанным путём по перечисленным клеткам. */
function pathMaze(width: number, height: number, path: [number, number][]): Maze {
  const walls = new Array<number>(width * height).fill(15);
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1] as [number, number];
    const [bx, by] = path[i] as [number, number];
    const dir = DIRS.find((d) => DELTA[d][0] === bx - ax && DELTA[d][1] === by - ay) as Dir;
    walls[ay * width + ax] = (walls[ay * width + ax] as number) & ~WALL[dir];
    walls[by * width + bx] = (walls[by * width + bx] as number) & ~WALL[OPPOSITE[dir]];
  }
  return { width, height, walls };
}

/** Коридор 1×width: p1 стартует слева, p2 — справа. */
function corridor(width: number, overrides: Partial<TerritoryConfig> = {}): TerritoryState {
  const path: [number, number][] = [];
  for (let x = 0; x < width; x++) path.push([x, 0]);
  const config: TerritoryConfig = { ...game.defaultConfig(), width, height: 1, ...overrides };
  const s = game.init(1, ['p1', 'p2'], config);
  s.maze = pathMaze(width, 1, path);
  return s;
}

function runTicks(s: TerritoryState, n: number, dt = DT): void {
  for (let i = 0; i < n && !game.result(s); i++) game.tick(s, dt);
}

const at = (s: TerritoryState, x: number, y = 0) => s.owner[y * s.maze.width + x];

describe('territoryGame: init и конфиг', () => {
  it('метаданные и конфиг по умолчанию', () => {
    expect(game.id).toBe('territory');
    expect(game.title).toBe('Территория');
    expect(game.kind).toBe('versus');
    expect(game.tickHz).toBe(30);
    expect(game.defaultConfig()).toEqual({
      width: 21,
      height: 15,
      braid: 0.35,
      speedCellsPerSec: 7,
      timeLimitMs: 90_000,
      fogRadius: null,
    });
    expect(getGame('territory')).toBe(game);
  });

  it('старт в противоположных углах, стартовые клетки уже свои', () => {
    const s = game.init(7, ['p1', 'p2'], game.defaultConfig());
    expect([s.players.p1.x, s.players.p1.y]).toEqual([0, 0]);
    expect([s.players.p2.x, s.players.p2.y]).toEqual([20, 14]);
    expect(s.owner).toHaveLength(21 * 15);
    expect(at(s, 0, 0)).toBe(1);
    expect(at(s, 20, 14)).toBe(2);
    expect(s.counts).toEqual({ p1: 1, p2: 1 });
    expect(countOwned(s.owner)).toEqual(s.counts);
    expect(s.result).toBeNull();
  });

  it('детерминизм: один seed и ввод — одинаковое состояние', () => {
    const play = () => {
      const s = game.init(42, ['p1', 'p2'], game.defaultConfig());
      const rng = new Rng(9);
      for (let i = 0; i < 600; i++) {
        if (i % 10 === 0) {
          game.applyInput(s, 'p1', { dir: rng.pick(DIRS) });
          game.applyInput(s, 'p2', { dir: rng.pick(DIRS) });
        }
        game.tick(s, DT);
      }
      return s;
    };
    expect(play()).toEqual(play());
    const a = game.init(1, ['p1', 'p2'], game.defaultConfig());
    const b = game.init(2, ['p1', 'p2'], game.defaultConfig());
    expect(a.maze.walls).not.toEqual(b.maze.walls);
  });

  it('parseConfig: хост меняет только туман и длительность из списка', () => {
    const base = game.defaultConfig();
    expect(game.parseConfig({ fogRadius: 3 }, base)).toEqual({ ...base, fogRadius: 3 });
    expect(game.parseConfig({ fogRadius: null }, { ...base, fogRadius: 3 })).toEqual(base);
    expect(game.parseConfig({ timeLimitMs: 150_000 }, base)?.timeLimitMs).toBe(150_000);
    expect(game.parseConfig({ timeLimitMs: 60_000 }, base)?.timeLimitMs).toBe(60_000);
    // Остальные поля игнорируются — берутся из base.
    expect(
      game.parseConfig({ width: 99, height: 2, braid: 1, speedCellsPerSec: 50 }, base),
    ).toEqual(base);
    expect(game.parseConfig({}, base)).toEqual(base);
    for (const bad of [
      { fogRadius: 0 },
      { fogRadius: 9 },
      { fogRadius: 2.5 },
      { fogRadius: '3' },
      { timeLimitMs: 30_000 },
      { timeLimitMs: 90_001 },
      { timeLimitMs: '90000' },
      { timeLimitMs: null },
    ]) {
      expect(game.parseConfig(bad, base), JSON.stringify(bad)).toBeNull();
    }
    expect(game.parseConfig(null, base)).toBeNull();
    expect(game.parseConfig('x', base)).toBeNull();
  });

  it('parseInput: направление или null, остальное отклоняется', () => {
    for (const dir of [...DIRS, null]) expect(game.parseInput({ dir })).toEqual({ dir });
    for (const bad of [null, 1, {}, { dir: 'north' }, { dir: 1 }, 'up']) {
      expect(game.parseInput(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('territoryGame: закраска', () => {
  it('клетка становится своей, когда игрок полностью в неё вошёл', () => {
    const s = corridor(8);
    game.applyInput(s, 'p1', { dir: 'right' });
    game.tick(s, DT); // 7/30 клетки — ещё в пути
    expect(at(s, 1)).toBe(0);
    runTicks(s, TICKS_PER_CELL);
    expect(at(s, 1)).toBe(1);
    expect(s.counts.p1).toBe(2);
    expect(countOwned(s.owner)).toEqual(s.counts);
  });

  it('чужую клетку можно перекрасить', () => {
    const s = corridor(6);
    game.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, TICKS_PER_CELL * 2);
    expect(at(s, 4)).toBe(2);
    expect(at(s, 3)).toBe(2);
    game.applyInput(s, 'p2', { dir: null });
    runTicks(s, TICKS_PER_CELL); // доезжает до центра клетки и стоит
    const p2x = s.players.p2.x;
    expect(s.counts).toEqual({ p1: 1, p2: 6 - p2x });

    game.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, TICKS_PER_CELL * 4);
    expect(at(s, 3)).toBe(1);
    expect(at(s, 4)).toBe(1);
    expect(countOwned(s.owner)).toEqual(s.counts);
    expect(s.counts.p1 + s.counts.p2).toBeLessThanOrEqual(6);
  });

  it('игроки проходят сквозь друг друга, раунд не кончается встречей', () => {
    const s = corridor(10);
    game.applyInput(s, 'p1', { dir: 'right' });
    game.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, TICKS_PER_CELL * 12);
    expect(s.result).toBeNull();
    expect(s.players.p1.x).toBe(9);
    expect(s.players.p2.x).toBe(0);
    // Каждый перекрасил всё за собой: последний прошедший клетку — её владелец.
    expect(at(s, 0)).toBe(2);
    expect(at(s, 9)).toBe(1);
    expect(countOwned(s.owner)).toEqual(s.counts);
    expect(s.counts.p1 + s.counts.p2).toBe(10);
  });

  it('мгновенный разворот не красит недостигнутую клетку', () => {
    const s = corridor(5);
    game.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 2); // ~0.47 клетки к (1, 0)
    game.applyInput(s, 'p1', { dir: 'left' });
    runTicks(s, TICKS_PER_CELL);
    expect(at(s, 1)).toBe(0);
    expect(s.players.p1.x).toBe(0);
    expect(s.counts.p1).toBe(1);
  });

  it('счётчики всегда согласованы с owner на случайной игре', () => {
    const s = game.init(5, ['p1', 'p2'], game.defaultConfig());
    const rng = new Rng(5);
    for (let i = 0; i < 1500; i++) {
      if (i % 7 === 0) game.applyInput(s, 'p1', { dir: rng.pick(DIRS) });
      if (i % 11 === 0) game.applyInput(s, 'p2', { dir: rng.pick(DIRS) });
      game.tick(s, DT);
      if (i % 50 === 0) expect(countOwned(s.owner)).toEqual(s.counts);
    }
    expect(countOwned(s.owner)).toEqual(s.counts);
  });
});

describe('territoryGame: конец раунда', () => {
  it('по времени: больше клеток — победа', () => {
    const s = corridor(8, { timeLimitMs: 60_000 });
    game.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, TICKS_PER_CELL * 3);
    game.applyInput(s, 'p1', { dir: null });
    runTicks(s, 2000);
    const r = game.result(s) as TerritoryResult;
    expect(r).not.toBeNull();
    expect(s.elapsedMs).toBeGreaterThanOrEqual(60_000);
    expect(r.reason).toBe('timeout');
    expect(r.winner).toBe('p1');
    expect(r.scores).toEqual(s.counts);
    expect(r.scores.p2).toBe(1);
    expect(r.totalCells).toBe(8);

    // После конца ни ввод, ни тики ничего не меняют.
    const snapshot = JSON.stringify(s);
    game.applyInput(s, 'p2', { dir: 'left' });
    game.tick(s, DT);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('по времени: поровну — ничья', () => {
    const s = corridor(8, { timeLimitMs: 60_000 });
    runTicks(s, 2000);
    expect(game.result(s)).toEqual({
      winner: 'draw',
      reason: 'timeout',
      scores: { p1: 1, p2: 1 },
      totalCells: 8,
    });
  });

  it('state и result переживают JSON и дальше играются одинаково', () => {
    const s = game.init(11, ['p1', 'p2'], game.defaultConfig());
    game.applyInput(s, 'p1', { dir: 'right' });
    game.applyInput(s, 'p2', { dir: 'up' });
    runTicks(s, 90);
    const copy = JSON.parse(JSON.stringify(s)) as TerritoryState;
    expect(copy).toEqual(s);
    for (const st of [s, copy]) {
      game.applyInput(st, 'p1', { dir: 'down' });
      runTicks(st, 120);
    }
    expect(copy).toEqual(s);
    // Компактно: state целиком рассылается 30 раз в секунду.
    expect(JSON.stringify(s).length).toBeLessThan(5000);
  });
});

/**
 * Жадный бот: направление к ближайшей не своей клетке по проходам. Считает от клетки, куда
 * точка сейчас едет (поворот применяется на въезде в неё), — как человек, заранее
 * нажимающий поворот.
 */
function greedyDir(s: TerritoryState, p: MazePlayer, mine: number): Dir | null {
  const { maze } = s;
  const me = { x: p.x, y: p.y };
  if (p.dir && p.moveProgress > LATE_TURN_WINDOW) {
    me.x += DELTA[p.dir][0];
    me.y += DELTA[p.dir][1];
  }
  const dist = bfsDistances(maze, me.x, me.y);
  let target = -1;
  for (let i = 0; i < dist.length; i++) {
    if ((dist[i] as number) <= 0 || s.owner[i] === mine) continue;
    if (target < 0 || (dist[i] as number) < (dist[target] as number)) target = i;
  }
  if (target < 0) return null;
  // Шаг назад от цели к игроку по убыванию расстояния.
  const fromTarget = bfsDistances(maze, target % maze.width, Math.floor(target / maze.width));
  const here = fromTarget[me.y * maze.width + me.x] as number;
  for (const dir of DIRS) {
    if (!canMove(maze, me.x, me.y, dir)) continue;
    const [dx, dy] = DELTA[dir];
    if (fromTarget[(me.y + dy) * maze.width + me.x + dx] !== here - 1) continue;
    // Назад — только из центра клетки: посреди перехода это был бы мгновенный разворот.
    // Отпускаем клавишу: точка доедет до клетки и остановится.
    return p.dir && p.moveProgress > 0 && dir === OPPOSITE[p.dir] ? null : dir;
  }
  return null;
}

describe('territoryGame: симуляция ботами', () => {
  it('60 seed: жадный и случайный боты доигрывают раунд с корректным итогом', () => {
    const config = { ...game.defaultConfig(), timeLimitMs: 15_000 };
    let greedyWins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = game.init(seed, ['p1', 'p2'], config);
      const rng = new Rng(seed * 31);
      // На нечётных seed жадный бот играет за p2 — проверяем обе стороны.
      const greedy = seed % 2 === 0 ? 'p1' : 'p2';
      const random = greedy === 'p1' ? 'p2' : 'p1';
      let guard = 0;
      let planKey = '';
      while (!game.result(s) && guard++ < 10_000) {
        // Перепланируем раз за клетку (BFS дорогой), а не каждый тик.
        const g = s.players[greedy];
        const key = `${g.x},${g.y},${g.dir},${g.moveProgress > LATE_TURN_WINDOW}`;
        if (key !== planKey) {
          planKey = key;
          game.applyInput(s, greedy, { dir: greedyDir(s, g, greedy === 'p1' ? 1 : 2) });
        }
        if (s.tick % 9 === 0) game.applyInput(s, random, { dir: rng.pick(DIRS) });
        game.tick(s, DT);
      }
      const r = game.result(s);
      expect(r, `seed ${seed}`).not.toBeNull();
      if (!r) continue;
      expect(r.reason).toBe('timeout');
      expect(r.totalCells).toBe(21 * 15);
      expect(r.scores).toEqual(countOwned(s.owner));
      expect(r.scores.p1 + r.scores.p2).toBeLessThanOrEqual(r.totalCells);
      const expected =
        r.scores.p1 === r.scores.p2 ? 'draw' : r.scores.p1 > r.scores.p2 ? 'p1' : 'p2';
      expect(r.winner).toBe(expected);
      if (r.winner === greedy) greedyWins++;
    }
    // Жадный бот почти всегда обыгрывает случайного.
    expect(greedyWins).toBeGreaterThan(50);
  }, 60_000); // 60 полных раундов: с запасом на медленный CI
});
