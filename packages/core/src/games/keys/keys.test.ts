import { describe, expect, it } from 'vitest';
import { DELTA, DIRS, OPPOSITE, WALL, canMove, makePlayer, startCell } from '../maze';
import type { Dir, Maze, MazePlayer } from '../maze';
import {
  MIN_PLATE_DISTANCE,
  closedEdges,
  edgeKey,
  keysGame,
  otherPlayer,
  pathBetween,
  reachDistances,
  solveDoors,
  type Door,
  type KeysConfig,
  type KeysState,
} from './index';

const DT = 1000 / keysGame.tickHz;
/** core собирается без DOM/Node-типов — таймер берём из глобального объекта. */
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
const cfg = (patch: Partial<KeysConfig> = {}): KeysConfig => ({
  ...keysGame.defaultConfig(),
  ...patch,
});

const startsOf = (maze: Maze) => {
  const [x1, y1] = startCell(maze, 'p1');
  const [x2, y2] = startCell(maze, 'p2');
  return { p1: y1 * maze.width + x1, p2: y2 * maze.width + x2 };
};
const exitOf = (s: KeysState) => s.exit[1] * s.maze.width + s.exit[0];

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

/** Коридор 1×12: p1 в x=0, p2 в x=11, выход в x=6. Двери/плиты задаёт тест. */
function corridor(doors: Door[] = []): KeysState {
  const s = keysGame.init(1, ['p1', 'p2'], cfg({ width: 12, height: 1 }));
  const cells: [number, number][] = [];
  for (let x = 0; x < 12; x++) cells.push([x, 0]);
  s.maze = pathMaze(12, 1, cells);
  s.exit = [6, 0];
  s.doors = doors;
  s.players = { p1: makePlayer(0, 0, 12), p2: makePlayer(11, 0, 12) };
  return s;
}

const door = (a: number, b: number, owner: 'p1' | 'p2', plate: number): Door => ({
  a,
  b,
  owner,
  plate,
  open: false,
  openedAtMs: null,
});

function runTicks(s: KeysState, n: number): void {
  for (let i = 0; i < n && !keysGame.result(s); i++) keysGame.tick(s, DT);
}

/** Проходит cells клеток в направлении dir и останавливается в центре клетки. */
function walk(s: KeysState, id: 'p1' | 'p2', dir: Dir, cells: number): void {
  const p = s.players[id];
  const target = p.steps + cells;
  keysGame.applyInput(s, id, { dir });
  for (let i = 0; i < 200 && !keysGame.result(s); i++) {
    if (p.steps >= target - 1 && p.moveProgress > 0) keysGame.applyInput(s, id, { dir: null });
    keysGame.tick(s, DT);
    if (p.steps >= target && p.moveProgress === 0) break;
  }
  keysGame.applyInput(s, id, { dir: null });
}

/** Шаг по кратчайшему пути к target с учётом закрытых дверей; null — уже там или не дойти. */
function stepToward(maze: Maze, from: number, target: number, closed: Set<number>): Dir | null {
  const dist = reachDistances(maze, target, closed);
  const here = dist[from] as number;
  if (here <= 0) return null;
  const x = from % maze.width;
  const y = (from - x) / maze.width;
  for (const dir of DIRS) {
    if (!canMove(maze, x, y, dir)) continue;
    const [dx, dy] = DELTA[dir];
    const next = (y + dy) * maze.width + x + dx;
    if (closed.has(edgeKey(from, next))) continue;
    if (dist[next] === here - 1) return dir;
  }
  return null;
}

/**
 * Кооперативный бот: идёт к достижимой плите закрытой двери партнёра, иначе — к выходу.
 * Решение принимается для клетки, в которую точка сейчас входит; кэш — по клетке и
 * набору открытых дверей (решение от них зависит однозначно).
 */
function botDir(s: KeysState, id: 'p1' | 'p2', cache: Map<string, Dir | null>): Dir | null {
  const me: MazePlayer = s.players[id];
  const [dx, dy] = me.moveProgress > 0 && me.dir ? DELTA[me.dir] : [0, 0];
  const cell = (me.y + dy) * s.maze.width + me.x + dx;
  const key = `${cell}|${s.doors.map((d) => (d.open ? 1 : 0)).join('')}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const dir = decideBot(s, id, cell);
  cache.set(key, dir);
  return dir;
}

function decideBot(s: KeysState, id: 'p1' | 'p2', cell: number): Dir | null {
  const closed = closedEdges(s.doors);
  const dist = reachDistances(s.maze, cell, closed);
  // Первая по списку достижимая плита (не «ближайшая»: иначе бот мечется между двумя
  // равноудалёнными целями, пересчитывая расстояние от следующей клетки).
  const plate = s.doors.find((d) => !d.open && d.owner !== id && (dist[d.plate] as number) >= 0);
  const target = plate ? plate.plate : exitOf(s);
  if ((dist[target] as number) < 0) return null;
  return stepToward(s.maze, cell, target, closed);
}

describe('keys: генерация дверей', () => {
  it('детерминирована: один seed — одинаковое состояние, разные seed — разные двери', () => {
    expect(keysGame.init(42, ['p1', 'p2'], cfg())).toEqual(keysGame.init(42, ['p1', 'p2'], cfg()));
    const a = keysGame.init(42, ['p1', 'p2'], cfg()).doors;
    const b = keysGame.init(43, ['p1', 'p2'], cfg()).doors;
    expect(a).not.toEqual(b);
  });

  it('выход в центре (10, 7), старты в противоположных углах', () => {
    const s = keysGame.init(5, ['p1', 'p2'], cfg());
    expect(s.exit).toEqual([10, 7]);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([0, 0]);
    expect([s.players.p2.x, s.players.p2.y]).toEqual([20, 14]);
  });

  for (const k of [2, 3]) {
    it(`300 seed × ${k} двери: решаемо, двери на пути владельца, плиты у партнёра`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const s = keysGame.init(seed, ['p1', 'p2'], cfg({ doorsPerPlayer: k }));
        const { maze, doors } = s;
        const starts = startsOf(maze);
        const exit = exitOf(s);
        const where = `seed ${seed}`;

        expect(
          doors.filter((d) => d.owner === 'p1'),
          where,
        ).toHaveLength(k);
        expect(
          doors.filter((d) => d.owner === 'p2'),
          where,
        ).toHaveLength(k);
        const solved = solveDoors(maze, doors, starts, exit);
        expect(solved.solvable, where).toBe(true);
        expect(solved.openOrder.length, where).toBe(doors.length);

        const plates = new Set(doors.map((d) => d.plate));
        expect(plates.size, where).toBe(doors.length);
        const edges = new Set(doors.map((d) => edgeKey(d.a, d.b)));
        expect(edges.size, where).toBe(doors.length);

        for (const [i, d] of doors.entries()) {
          const partner = otherPlayer(d.owner);
          // Дверь — проход на единственном пути владельца к выходу.
          const path = pathBetween(maze, starts[d.owner], exit);
          const at = path.indexOf(d.a);
          expect(at, where).toBeGreaterThanOrEqual(0);
          expect(path[at + 1], where).toBe(d.b);
          // Открывает партнёр; плита не за своей дверью (достижима партнёром мимо неё).
          expect(solved.openedBy[i], where).toBe(partner);
          const aroundOwnDoor = reachDistances(maze, starts[partner], new Set([edgeKey(d.a, d.b)]));
          expect(aroundOwnDoor[d.plate] as number, where).toBeGreaterThanOrEqual(0);
          // Не тривиально: плита далеко от двери, не на старте и не на выходе.
          const da = reachDistances(maze, d.a, new Set());
          const db = reachDistances(maze, d.b, new Set());
          expect(
            Math.min(da[d.plate] as number, db[d.plate] as number),
            where,
          ).toBeGreaterThanOrEqual(MIN_PLATE_DISTANCE);
          expect([starts.p1, starts.p2, exit], where).not.toContain(d.plate);
          expect(d.open).toBe(false);
          expect(d.openedAtMs).toBeNull();
        }
        // Без открытых дверей до выхода не дойти никому.
        const closed = closedEdges(doors);
        expect(reachDistances(maze, starts.p1, closed)[exit], where).toBe(-1);
        expect(reachDistances(maze, starts.p2, closed)[exit], where).toBe(-1);
      }
    }, 60_000);
  }

  // Без нагрузки ≈1–2 мс на генерацию (цель < 5 мс); порог с запасом на загруженный CI.
  it('генерация быстрая', () => {
    keysGame.init(1, ['p1', 'p2'], cfg({ doorsPerPlayer: 3 })); // прогрев JIT
    const t0 = clock.now();
    for (let seed = 1000; seed < 1100; seed++) {
      keysGame.init(seed, ['p1', 'p2'], cfg({ doorsPerPlayer: 3 }));
    }
    expect((clock.now() - t0) / 100).toBeLessThan(25);
  });
});

describe('keys: двери и плиты', () => {
  it('закрытая дверь не пускает (и владельца, и партнёра)', () => {
    // Дверь между x=3 и x=4, плита в x=10 (её никто не трогает).
    const s = corridor([door(3, 4, 'p1', 10)]);
    keysGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 60);
    expect(s.players.p1.x).toBe(3);
    expect(s.players.p1.moveProgress).toBe(0);
    expect(s.doors[0]?.open).toBe(false);

    const t = corridor([door(7, 8, 'p1', 0)]);
    t.players.p1 = makePlayer(5, 0, 12);
    keysGame.applyInput(t, 'p2', { dir: 'left' });
    runTicks(t, 60);
    expect(t.players.p2.x).toBe(8);
  });

  it('плита открывает дверь навсегда, после этого проход свободен', () => {
    // Дверь p1 между 2 и 3; плита в x=9 — на неё наступает p2.
    const s = corridor([door(2, 3, 'p1', 9)]);
    keysGame.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, 3);
    expect(s.doors[0]?.open).toBe(false);
    runTicks(s, 12);
    expect(s.players.p2.visited).toContain(9);
    expect(s.doors[0]?.open).toBe(true);
    expect(s.doors[0]?.openedAtMs).toBeGreaterThan(0);
    const openedAt = s.doors[0]?.openedAtMs;

    keysGame.applyInput(s, 'p2', { dir: null });
    keysGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 20);
    expect(s.players.p1.x).toBeGreaterThan(3);
    expect(s.doors[0]?.openedAtMs).toBe(openedAt);
  });

  it('выход: нужны оба игрока на клетке выхода одновременно', () => {
    const s = corridor();
    s.players.p1 = makePlayer(6, 0, 12);
    runTicks(s, 5);
    // p1 стоит на выходе, p2 далеко — игра продолжается.
    expect(keysGame.result(s)).toBeNull();

    // p1 уходит с выхода, p2 приходит — всё ещё нет.
    walk(s, 'p1', 'left', 1);
    expect(s.players.p1.x).toBe(5);
    walk(s, 'p2', 'left', 5);
    expect(s.players.p2.x).toBe(6);
    expect(keysGame.result(s)).toBeNull();

    // p1 возвращается — выбрались.
    walk(s, 'p1', 'right', 1);
    const r = keysGame.result(s);
    expect(r).toMatchObject({ winner: 'team', reason: 'escaped', doorsOpened: 0, totalDoors: 0 });
    expect(r?.timeMs).toBe(s.elapsedMs);
  });

  it('время вышло — winner none, ввод и тики после конца игнорируются', () => {
    const s = keysGame.init(3, ['p1', 'p2'], cfg({ timeLimitMs: 1000 }));
    runTicks(s, 100);
    const r = keysGame.result(s);
    expect(r).toEqual({
      winner: 'none',
      reason: 'timeout',
      timeMs: s.elapsedMs,
      doorsOpened: 0,
      totalDoors: s.doors.length,
    });
    const snapshot = JSON.stringify(s);
    keysGame.applyInput(s, 'p1', { dir: 'right' });
    keysGame.tick(s, DT);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('keys: настройки, ввод, сериализация', () => {
  const base = keysGame.defaultConfig();

  it('конфиг по умолчанию', () => {
    expect(base).toEqual({
      width: 21,
      height: 15,
      speedCellsPerSec: 7,
      timeLimitMs: 180_000,
      fogRadius: 3,
      doorsPerPlayer: 2,
    });
    expect(keysGame.kind).toBe('coop');
    expect(keysGame.id).toBe('keys');
  });

  it('parseConfig меняет только туман и число дверей', () => {
    expect(keysGame.parseConfig({}, base)).toEqual(base);
    expect(keysGame.parseConfig({ fogRadius: null, doorsPerPlayer: 3 }, base)).toEqual({
      ...base,
      fogRadius: null,
      doorsPerPlayer: 3,
    });
    expect(keysGame.parseConfig({ fogRadius: 8 }, base)?.fogRadius).toBe(8);
    expect(keysGame.parseConfig({ width: 99, timeLimitMs: 1, speedCellsPerSec: 50 }, base)).toEqual(
      base,
    );
  });

  it('parseConfig отклоняет мусор', () => {
    for (const raw of [
      null,
      'x',
      42,
      { fogRadius: 0 },
      { fogRadius: 9 },
      { fogRadius: 2.5 },
      { fogRadius: '3' },
      { doorsPerPlayer: 1 },
      { doorsPerPlayer: 4 },
      { doorsPerPlayer: '2' },
      { doorsPerPlayer: null },
    ]) {
      expect(keysGame.parseConfig(raw, base), JSON.stringify(raw)).toBeNull();
    }
  });

  it('parseInput', () => {
    expect(keysGame.parseInput({ dir: 'up' })).toEqual({ dir: 'up' });
    expect(keysGame.parseInput({ dir: null })).toEqual({ dir: null });
    for (const raw of [null, {}, { dir: 'jump' }, { dir: 1 }, 'up']) {
      expect(keysGame.parseInput(raw)).toBeNull();
    }
  });

  it('состояние переживает JSON (и в середине, и после игры)', () => {
    const s = keysGame.init(9, ['p1', 'p2'], cfg());
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    s.doors[0]!.open = true;
    s.doors[0]!.openedAtMs = 100;
    keysGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 30);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    s.config.timeLimitMs = s.elapsedMs + DT;
    runTicks(s, 5);
    expect(s.result).not.toBeNull();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('keys: полная игра двумя ботами', () => {
  for (const k of [2, 3]) {
    it(`боты-напарники всегда выбираются (${k} двери у каждого)`, () => {
      const seeds = k === 2 ? 60 : 30;
      for (let seed = 1; seed <= seeds; seed++) {
        const s = keysGame.init(seed * 7919, ['p1', 'p2'], cfg({ doorsPerPlayer: k }));
        const where = `seed ${seed * 7919}`;
        const cache = { p1: new Map<string, Dir | null>(), p2: new Map<string, Dir | null>() };
        while (!keysGame.result(s)) {
          keysGame.applyInput(s, 'p1', { dir: botDir(s, 'p1', cache.p1) });
          keysGame.applyInput(s, 'p2', { dir: botDir(s, 'p2', cache.p2) });
          keysGame.tick(s, DT);
        }
        const r = keysGame.result(s);
        expect(r?.winner, where).toBe('team');
        expect(r?.reason, where).toBe('escaped');
        expect(r?.doorsOpened, where).toBe(2 * k);
        expect(r?.totalDoors, where).toBe(2 * k);
        expect(r?.timeMs as number, where).toBeLessThan(s.config.timeLimitMs);
        // Моменты открытия записаны.
        for (const d of s.doors) expect(d.openedAtMs, where).not.toBeNull();
      }
    }, 60_000);
  }

  it('в сгенерированном лабиринте игрок не проходит сквозь закрытую дверь', () => {
    const s = keysGame.init(11, ['p1', 'p2'], cfg());
    const closed = closedEdges(s.doors);
    // Без плит: зона p1 при закрытых дверях.
    const zone = reachDistances(s.maze, startsOf(s.maze).p1, closed);
    const dirs: Dir[] = ['right', 'down', 'left', 'up'];
    for (let i = 0; i < 2000 && !keysGame.result(s); i++) {
      if (i % 9 === 0) keysGame.applyInput(s, 'p1', { dir: dirs[(i * 7) % 4] as Dir });
      keysGame.tick(s, DT);
      // Пока p2 стоит, ни одна дверь не открывается — p1 остаётся в своей зоне
      // (плиты его дверей у партнёра).
      if (s.doors.some((d) => d.open)) continue;
      const p = s.players.p1;
      expect(zone[p.y * s.maze.width + p.x] as number).toBeGreaterThanOrEqual(0);
    }
  });
});
