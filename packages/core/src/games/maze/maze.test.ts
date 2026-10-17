import { describe, expect, it } from 'vitest';
import {
  WALL,
  bfsDistances,
  canMove,
  fogVisible,
  generateMaze,
  mazeGame,
  startCell,
  visibleCells,
  type Dir,
  type Maze,
  type MazeConfig,
  type MazePlayer,
  type MazeState,
} from './index';
import { DELTA, DIRS, OPPOSITE } from './grid';

const DT = 1000 / mazeGame.tickHz;

/** Лабиринт из одних стен, в котором прорезан путь по перечисленным клеткам. */
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

function openPassages(maze: Maze): number {
  let n = 0;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (canMove(maze, x, y, 'right')) n++;
      if (canMove(maze, x, y, 'down')) n++;
    }
  }
  return n;
}

function stateWith(maze: Maze, overrides: Partial<MazeConfig> = {}): MazeState {
  const config: MazeConfig = {
    ...mazeGame.defaultConfig(),
    width: maze.width,
    height: maze.height,
    ...overrides,
  };
  const s = mazeGame.init(1, ['p1', 'p2'], config);
  s.maze = maze;
  return s;
}

function runTicks(s: MazeState, n: number, dt = DT): void {
  for (let i = 0; i < n && !mazeGame.result(s); i++) mazeGame.tick(s, dt);
}

/** Направление по кратчайшему пути от (x, y) к (tx, ty). */
function bfsStep(maze: Maze, x: number, y: number, tx: number, ty: number): Dir | null {
  const dist = bfsDistances(maze, tx, ty);
  const here = dist[y * maze.width + x] as number;
  for (const dir of DIRS) {
    if (!canMove(maze, x, y, dir)) continue;
    const [dx, dy] = DELTA[dir];
    if (dist[(y + dy) * maze.width + x + dx] === here - 1) return dir;
  }
  return null;
}

/**
 * Бот держит направление, нужное в клетке, куда он сейчас едет (поворот применяется
 * на въезде в неё), — как человек, заранее нажимающий поворот.
 */
function botDir(maze: Maze, me: MazePlayer, other: MazePlayer): Dir | null {
  const [dx, dy] = me.moveProgress > 0 && me.dir ? DELTA[me.dir] : [0, 0];
  const x = me.x + dx;
  const y = me.y + dy;
  return bfsStep(maze, x, y, other.x, other.y) ?? me.dir;
}

describe('generateMaze', () => {
  it('один seed — идентичный лабиринт, разные seed — разные', () => {
    expect(generateMaze(42, 21, 15)).toEqual(generateMaze(42, 21, 15));
    expect(generateMaze(42, 21, 15, 0.5)).toEqual(generateMaze(42, 21, 15, 0.5));
    expect(generateMaze(42, 21, 15).walls).not.toEqual(generateMaze(43, 21, 15).walls);
  });

  it('лабиринт идеальный: связный и рёбер = клеток − 1', () => {
    for (const seed of [1, 2, 3, 99, 12345, 0xdeadbeef]) {
      for (const [w, h] of [
        [21, 15],
        [5, 5],
        [1, 7],
        [8, 1],
        [1, 1],
      ] as const) {
        const maze = generateMaze(seed, w, h);
        expect(bfsDistances(maze, 0, 0).every((d) => d >= 0)).toBe(true);
        expect(openPassages(maze)).toBe(w * h - 1);
      }
    }
  });

  it('стены симметричны у соседей, граница закрыта', () => {
    for (const braid of [0, 1]) {
      const maze = generateMaze(7, 21, 15, braid);
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          const mask = maze.walls[y * maze.width + x] as number;
          for (const dir of DIRS) {
            const [dx, dy] = DELTA[dir];
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= maze.width || ny >= maze.height) {
              expect(mask & WALL[dir]).not.toBe(0);
              continue;
            }
            const other = maze.walls[ny * maze.width + nx] as number;
            expect(Boolean(mask & WALL[dir])).toBe(Boolean(other & WALL[OPPOSITE[dir]]));
          }
        }
      }
    }
  });

  it('braid добавляет петли, лабиринт остаётся связным; braid = 0 не меняет лабиринт', () => {
    const perfect = generateMaze(5, 21, 15);
    const braided = generateMaze(5, 21, 15, 0.5);
    const full = generateMaze(5, 21, 15, 1);
    expect(openPassages(braided)).toBeGreaterThan(21 * 15 - 1);
    expect(openPassages(full)).toBeGreaterThan(openPassages(braided));
    expect(bfsDistances(braided, 0, 0).every((d) => d >= 0)).toBe(true);
    // braid = 1: тупиков не остаётся (кроме вырожденных случаев — у 21×15 их нет).
    const deadEnds = full.walls.filter((m) => [1, 2, 4, 8].filter((b) => m & b).length === 3);
    expect(deadEnds).toHaveLength(0);
    // Стены braid-лабиринта — подмножество стен идеального с тем же seed.
    perfect.walls.forEach((m, i) => expect((full.walls[i] as number) & ~m).toBe(0));
    // Коридор 1×N: у тупиков нет соседей за стеной — braid ничего не ломает.
    expect(generateMaze(3, 6, 1, 1)).toEqual(generateMaze(3, 6, 1));
  });

  it('отвергает некорректный размер', () => {
    expect(() => generateMaze(1, 0, 5)).toThrow();
    expect(() => generateMaze(1, 2.5, 5)).toThrow();
  });
});

describe('bfsDistances и visibleCells', () => {
  // Буква «Г»: (0,0) → (1,0) → (2,0) → (2,1); (0,1) и (1,1) отрезаны.
  const maze = pathMaze(3, 2, [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ]);

  it('считает расстояния по проходам, -1 — недостижимо', () => {
    expect(bfsDistances(maze, 0, 0)).toEqual([0, 1, 2, -1, -1, 3]);
    expect(bfsDistances(maze, 5, 5)).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it('туман: радиус по проходам, стены блокируют обзор', () => {
    expect(visibleCells(maze, 0, 0, 0)).toEqual([0]);
    // (0,1) геометрически рядом, но за стеной — не видна.
    expect(visibleCells(maze, 0, 0, 1)).toEqual([0, 1]);
    expect(visibleCells(maze, 0, 0, 3).sort()).toEqual([0, 1, 2, 5]);
    expect(visibleCells(maze, 0, 0, -1)).toEqual([]);
    expect(fogVisible).toBe(visibleCells);
  });

  it('туман в идеальном лабиринте — подмножество клеток на расстоянии ≤ радиуса', () => {
    const m = generateMaze(11, 21, 15);
    const dist = bfsDistances(m, 10, 7);
    const visible = visibleCells(m, 10, 7, 3);
    expect(visible.sort((a, b) => a - b)).toEqual(
      dist.flatMap((d, i) => (d >= 0 && d <= 3 ? [i] : [])),
    );
  });
});

describe('mazeGame: init и ввод', () => {
  it('игроки стартуют в противоположных углах, init использует braid', () => {
    const cfg = { ...mazeGame.defaultConfig(), braid: 0.5 };
    const s = mazeGame.init(1, ['p1', 'p2'], cfg);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([0, 0]);
    expect([s.players.p2.x, s.players.p2.y]).toEqual([cfg.width - 1, cfg.height - 1]);
    expect(startCell(s.maze, 'p2')).toEqual([cfg.width - 1, cfg.height - 1]);
    expect(s.maze).toEqual(generateMaze(1, cfg.width, cfg.height, 0.5));
    expect(s.players.p1.visited).toEqual([0]);
  });

  it('конфиг по умолчанию: счёт bfs, туман 3', () => {
    expect(mazeGame.defaultConfig()).toMatchObject({ scoring: 'bfs', fogRadius: 3, braid: 0 });
  });

  it('проверяет ввод', () => {
    expect(mazeGame.parseInput({ dir: 'up' })).toEqual({ dir: 'up' });
    expect(mazeGame.parseInput({ dir: null })).toEqual({ dir: null });
    expect(mazeGame.parseInput({ dir: 'north' })).toBeNull();
    expect(mazeGame.parseInput({})).toBeNull();
    expect(mazeGame.parseInput(null)).toBeNull();
    expect(mazeGame.parseInput(5)).toBeNull();
  });

  it('состояние сериализуется в JSON без потерь (и после игры)', () => {
    const s = mazeGame.init(9, ['p1', 'p2'], mazeGame.defaultConfig());
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.applyInput(s, 'p1', { dir: 'down' });
    runTicks(s, 20);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('mazeGame: движение', () => {
  it('нельзя пройти сквозь стену', () => {
    const maze = pathMaze(5, 5, [
      [0, 0],
      [1, 0],
    ]);
    const s = stateWith(maze);
    mazeGame.applyInput(s, 'p1', { dir: 'down' });
    runTicks(s, 60);
    expect(s.players.p1).toMatchObject({ x: 0, y: 0, moveProgress: 0, steps: 0, dir: null });
    mazeGame.applyInput(s, 'p1', { dir: 'left' }); // граница поля
    runTicks(s, 60);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([0, 0]);
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 60);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([1, 0]);
  });

  it('в сгенерированном лабиринте игрок никогда не проходит сквозь стену', () => {
    const s = mazeGame.init(3, ['p1', 'p2'], mazeGame.defaultConfig());
    const dirs: Dir[] = ['right', 'down', 'left', 'up'];
    for (let t = 0; t < 600 && !s.result; t++) {
      if (t % 13 === 0) mazeGame.applyInput(s, 'p1', { dir: dirs[(t / 13) % 4] as Dir });
      const before = { x: s.players.p1.x, y: s.players.p1.y };
      mazeGame.tick(s, DT);
      const p = s.players.p1;
      if (p.x !== before.x || p.y !== before.y) {
        const dir = DIRS.find(
          (d) => DELTA[d][0] === p.x - before.x && DELTA[d][1] === p.y - before.y,
        ) as Dir;
        expect(dir).toBeDefined();
        expect(canMove(s.maze, before.x, before.y, dir)).toBe(true);
      }
    }
  });

  it('скорость — 7 клеток/сек при фиксированном dt', () => {
    const s = stateWith(generateMaze(1, 20, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 31);
    expect(s.players.p1.x).toBe(7);
    expect(s.players.p1.steps).toBe(7);
  });

  it('отпущенная клавиша — остановка в центре следующей клетки', () => {
    const s = stateWith(generateMaze(1, 20, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 2);
    expect(s.players.p1.moveProgress).toBeGreaterThan(0);
    mazeGame.applyInput(s, 'p1', { dir: null });
    runTicks(s, 30);
    expect(s.players.p1).toMatchObject({ x: 1, moveProgress: 0, dir: null });
  });

  it('буфер поворота: нажатый заранее поворот срабатывает на ближайшем перекрёстке', () => {
    // (0,0) → (1,0) → (2,0) → (2,1) → (2,2); p2 замурован в (4,4).
    const maze = pathMaze(5, 5, [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    const s = stateWith(maze);
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.tick(s, DT);
    expect(s.players.p1.dir).toBe('right');
    mazeGame.applyInput(s, 'p1', { dir: 'down' }); // вниз пока стена — едем дальше вправо
    runTicks(s, 5);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([1, 0]);
    expect(s.players.p1.dir).toBe('right');
    runTicks(s, 60);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([2, 2]);
    expect(s.players.p1.visited).toEqual([0, 1, 2, 7, 12]);
  });

  it('visited без повторов, steps считает возвраты', () => {
    const s = stateWith(generateMaze(1, 20, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 9); // 2.1 клетки: x = 2, переход к 3 только начат
    mazeGame.applyInput(s, 'p1', { dir: 'left' }); // мгновенный разворот, 3 не достигнута
    runTicks(s, 60);
    expect(s.players.p1.x).toBe(0);
    expect(s.players.p1.visited).toEqual([0, 1, 2]);
    // 2 вперёд + 3 возврата (возврат в клетку 2 после разворота тоже шаг).
    expect(s.players.p1.steps).toBe(5);
  });

  it('мгновенный разворот посреди перехода: позиция сохраняется, клетка-цель меняется', () => {
    // speed 3, dt 100 → 0.3 клетки за тик.
    const s = stateWith(generateMaze(1, 20, 1), { speedCellsPerSec: 3 });
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.tick(s, 100);
    expect(s.players.p1).toMatchObject({ x: 0, dir: 'right' });
    expect(s.players.p1.moveProgress).toBeCloseTo(0.3);
    mazeGame.applyInput(s, 'p1', { dir: 'left' });
    mazeGame.tick(s, 100);
    // Разворот: теперь идём из (1,0) в (0,0); физически 0.3 − 0.3 = 0 → почти дома.
    expect(s.players.p1).toMatchObject({ x: 1, dir: 'left' });
    expect(s.players.p1.moveProgress).toBeCloseTo(1);
    mazeGame.tick(s, 100);
    expect(s.players.p1).toMatchObject({ x: 0, y: 0 });
    expect(s.players.p1.visited).toEqual([0]);
  });

  it('разворот не ждёт центра клетки и детерминирован', () => {
    const run = () => {
      const s = stateWith(generateMaze(1, 20, 1), { speedCellsPerSec: 3 });
      mazeGame.applyInput(s, 'p1', { dir: 'right' });
      runTicks(s, 5, 100); // 1.5 клетки: x = 1, прогресс 0.5
      mazeGame.applyInput(s, 'p1', { dir: 'left' });
      mazeGame.tick(s, 100);
      return s;
    };
    const s = run();
    expect(s.players.p1).toMatchObject({ x: 2, dir: 'left' });
    expect(s.players.p1.moveProgress).toBeCloseTo(0.8);
    expect(run()).toEqual(s);
  });

  it('разворот перед встречей: встреча и счёт считаются по новой клетке', () => {
    // Коридор 8×1: p1 идёт вправо, разворачивается; p2 идёт навстречу.
    const s = stateWith(generateMaze(1, 8, 1), { speedCellsPerSec: 3 });
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, 8, 100); // по 2.4 клетки: p1 x = 2, p2 x = 5
    expect([s.players.p1.x, s.players.p2.x]).toEqual([2, 5]);
    mazeGame.applyInput(s, 'p1', { dir: 'left' }); // разворот: p1 теперь «в» клетке 3
    runTicks(s, 100, 100);
    const r = mazeGame.result(s);
    expect(r?.reason).toBe('met');
    expect(s.players.p2.x - s.players.p1.x).toBeLessThanOrEqual(1);
    const d1 = bfsDistances(s.maze, 0, 0);
    const d2 = bfsDistances(s.maze, 7, 0);
    expect(r?.scores).toEqual({ p1: d1[s.players.p1.x], p2: d2[s.players.p2.x] });
  });
});

describe('mazeGame: встреча и счёт', () => {
  it('два бота по BFS всегда встречаются, счёт bfs корректен', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 1000, 31337]) {
      const s = mazeGame.init(seed, ['p1', 'p2'], mazeGame.defaultConfig());
      for (let t = 0; t < 30 * 180 && !s.result; t++) {
        const { p1, p2 } = s.players;
        mazeGame.applyInput(s, 'p1', { dir: botDir(s.maze, p1, p2) });
        mazeGame.applyInput(s, 'p2', { dir: botDir(s.maze, p2, p1) });
        mazeGame.tick(s, DT);
      }
      const r = mazeGame.result(s);
      expect(r?.reason).toBe('met');
      if (!r || !r.meetCell) throw new Error('нет результата');
      const { p1, p2 } = s.players;
      const d1 = bfsDistances(s.maze, 0, 0);
      const d2 = bfsDistances(s.maze, s.maze.width - 1, s.maze.height - 1);
      expect(r.pathLength).toBe(d1[s.maze.width * s.maze.height - 1]);
      expect(r.scores.p1).toBe(d1[p1.y * s.maze.width + p1.x]);
      expect(r.scores.p2).toBe(d2[p2.y * s.maze.width + p2.x]);
      // Идеальный лабиринт: оба на единственном пути между стартами.
      const sum = r.scores.p1 + r.scores.p2;
      expect([r.pathLength, r.pathLength - 1]).toContain(sum);
      expect([
        [p1.x, p1.y],
        [p2.x, p2.y],
      ]).toContainEqual(r.meetCell);
      const expectedWinner =
        r.scores.p1 === r.scores.p2 ? 'draw' : r.scores.p1 > r.scores.p2 ? 'p1' : 'p2';
      expect(r.winner).toBe(expectedWinner);
    }
  });

  it('ничья при симметричной встрече в соседних клетках', () => {
    const s = stateWith(generateMaze(1, 8, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, 300);
    expect(mazeGame.result(s)).toMatchObject({
      winner: 'draw',
      reason: 'met',
      scores: { p1: 3, p2: 3 },
      pathLength: 7,
    });
    expect(s.players.p1.x).toBe(3);
    expect(s.players.p2.x).toBe(4);
  });

  it('ничья при симметричной встрече в одной клетке', () => {
    const s = stateWith(generateMaze(1, 7, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, 300);
    expect(mazeGame.result(s)).toMatchObject({
      winner: 'draw',
      scores: { p1: 3, p2: 3 },
      meetCell: [3, 0],
    });
  });

  it('проскок навстречу за один большой тик всё равно засчитывается как встреча', () => {
    const s = stateWith(generateMaze(1, 8, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.applyInput(s, 'p2', { dir: 'left' });
    mazeGame.tick(s, 1000); // 7 клеток каждому — без подшагов разминулись бы
    expect(mazeGame.result(s)).toMatchObject({ reason: 'met', winner: 'draw' });
    expect(s.players.p1.x).toBeLessThan(s.players.p2.x);
  });

  it('соседние клетки через стену — не встреча', () => {
    // p1 в (0,0), p2 в (1,0) — между ними стена; проходов нет.
    const s = stateWith(pathMaze(2, 1, []));
    runTicks(s, 3);
    expect(mazeGame.result(s)).toBeNull();
  });

  it('кто прошёл дальше — тот победил (bfs)', () => {
    const s = stateWith(generateMaze(1, 8, 1));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 300);
    const r = mazeGame.result(s);
    expect(r).toMatchObject({ winner: 'p1', reason: 'met', scores: { p1: 6, p2: 0 } });
    expect(r?.meetCell).toEqual([6, 0]);
  });

  it('режим distinct — число уникальных клеток', () => {
    const s = stateWith(generateMaze(1, 8, 1), { scoring: 'distinct' });
    mazeGame.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, 300);
    expect(mazeGame.result(s)).toMatchObject({ winner: 'p2', scores: { p1: 1, p2: 7 } });
  });

  it('режим steps — все шаги, включая возвраты', () => {
    const s = stateWith(generateMaze(1, 8, 1), { scoring: 'steps' });
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    runTicks(s, 9);
    mazeGame.applyInput(s, 'p1', { dir: 'left' });
    runTicks(s, 30);
    expect(s.players.p1.x).toBe(0);
    mazeGame.applyInput(s, 'p1', { dir: null });
    mazeGame.applyInput(s, 'p2', { dir: 'left' });
    runTicks(s, 300);
    // p1: 2 вправо + разворот + 3 назад; p2: от 7 до 1 — 6 шагов.
    expect(mazeGame.result(s)).toMatchObject({ winner: 'p2', scores: { p1: 5, p2: 6 } });

    const s2 = stateWith(generateMaze(1, 8, 1), { scoring: 'steps' });
    mazeGame.applyInput(s2, 'p1', { dir: 'right' });
    runTicks(s2, 9);
    mazeGame.applyInput(s2, 'p1', { dir: 'left' });
    runTicks(s2, 30);
    mazeGame.applyInput(s2, 'p1', { dir: 'right' });
    runTicks(s2, 300);
    expect(mazeGame.result(s2)).toMatchObject({ winner: 'p1', scores: { p1: 11, p2: 0 } });
  });

  it('таймаут даёт ничью со счётом', () => {
    const cfg = { ...mazeGame.defaultConfig(), timeLimitMs: 1000 };
    const s = mazeGame.init(1, ['p1', 'p2'], cfg);
    runTicks(s, 100);
    const r = mazeGame.result(s);
    expect(r).toMatchObject({ winner: 'draw', reason: 'timeout', meetCell: null });
    expect(r?.pathLength).toBeGreaterThan(0);
    expect([30, 31]).toContain(s.tick);
  });

  it('после окончания раунда ввод и тики игнорируются', () => {
    const cfg = { ...mazeGame.defaultConfig(), timeLimitMs: 100 };
    const s = mazeGame.init(1, ['p1', 'p2'], cfg);
    runTicks(s, 10);
    const snapshot = JSON.parse(JSON.stringify(s));
    mazeGame.applyInput(s, 'p1', { dir: 'right' });
    mazeGame.tick(s, DT);
    expect(s).toEqual(snapshot);
  });
});
