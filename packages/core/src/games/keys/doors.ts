// Двери, плиты и проверка решаемости для «Ключа и двери».
// Двери стоят на «своём» участке пути игрока к выходу (до слияния с путём партнёра),
// плита каждой двери — там, куда может дойти партнёр. Решатель проверяет, что, открывая
// двери по очереди, оба игрока доходят до выхода.
import type { PlayerId } from '../../minigame';
import { Rng } from '../../rng';
import { DELTA, DIRS, canMove } from '../maze/grid';
import type { Dir, Maze } from '../maze/types';
import type { Door } from './types';

/** Минимальное расстояние по проходам от плиты до её двери (чтобы не было «нажал рядом»). */
export const MIN_PLATE_DISTANCE = 6;
/** Минимальный промежуток (в проходах) между соседними дверями одного игрока. */
const MIN_DOOR_GAP = 3;
/** Первая дверь не ближе этого числа проходов от старта. */
const MIN_DOOR_INDEX = 2;
/** Попыток расставить двери на одно их количество, затем — на одну меньше. */
const ATTEMPTS = 40;

export const otherPlayer = (id: PlayerId): PlayerId => (id === 'p1' ? 'p2' : 'p1');

/** Ключ прохода между соседними клетками a и b (не зависит от порядка). */
export function edgeKey(a: number, b: number): number {
  return a < b ? a * 65536 + b : b * 65536 + a;
}

/** Проходы, перекрытые закрытыми дверями. */
export function closedEdges(doors: readonly Door[]): Set<number> {
  const set = new Set<number>();
  for (const d of doors) if (!d.open) set.add(edgeKey(d.a, d.b));
  return set;
}

/** Соседняя клетка в направлении dir (без проверки стен). */
export function neighbour(maze: Maze, cell: number, dir: Dir): number {
  const [dx, dy] = DELTA[dir];
  return cell + dy * maze.width + dx;
}

/**
 * Расстояния (в проходах) от клетки from с учётом закрытых проходов closed.
 * -1 — недостижимо.
 */
export function reachDistances(maze: Maze, from: number, closed: ReadonlySet<number>): number[] {
  const { width } = maze;
  const dist = new Array<number>(width * maze.height).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] as number;
    const x = cell % width;
    const y = (cell - x) / width;
    for (const dir of DIRS) {
      if (!canMove(maze, x, y, dir)) continue;
      const next = neighbour(maze, cell, dir);
      if (dist[next] !== -1 || closed.has(edgeKey(cell, next))) continue;
      dist[next] = (dist[cell] as number) + 1;
      queue.push(next);
    }
  }
  return dist;
}

/** Кратчайший путь (список клеток от from до to включительно); [] — недостижимо. */
export function pathBetween(
  maze: Maze,
  from: number,
  to: number,
  closed: ReadonlySet<number> = new Set(),
): number[] {
  const dist = reachDistances(maze, to, closed);
  if ((dist[from] as number) < 0) return [];
  const path = [from];
  let cell = from;
  while (cell !== to) {
    const x = cell % maze.width;
    const y = (cell - x) / maze.width;
    const d = dist[cell] as number;
    const dir = DIRS.find((dd) => {
      if (!canMove(maze, x, y, dd)) return false;
      const n = neighbour(maze, cell, dd);
      return dist[n] === d - 1 && !closed.has(edgeKey(cell, n));
    }) as Dir;
    cell = neighbour(maze, cell, dir);
    path.push(cell);
  }
  return path;
}

export interface SolveResult {
  /** Оба игрока могут дойти до выхода. */
  solvable: boolean;
  /** Индексы дверей в порядке открытия (по «волнам»). */
  openOrder: number[];
  /** Кто открывает дверь (всегда партнёр владельца). */
  openedBy: (PlayerId | null)[];
}

/**
 * Решатель: множество открытых дверей растёт. На каждой волне считаем, куда может дойти
 * каждый игрок при закрытых оставшихся дверях; дверь открывается, если её плита в зоне
 * партнёра владельца. Повторяем до неподвижной точки; решаемо, если оба дошли до выхода.
 */
export function solveDoors(
  maze: Maze,
  doors: readonly Door[],
  starts: Readonly<Record<PlayerId, number>>,
  exit: number,
): SolveResult {
  const open = doors.map((d) => d.open);
  const openOrder: number[] = [];
  const openedBy: (PlayerId | null)[] = doors.map(() => null);
  const closedNow = () => {
    const set = new Set<number>();
    doors.forEach((d, i) => {
      if (!open[i]) set.add(edgeKey(d.a, d.b));
    });
    return set;
  };
  for (;;) {
    const closed = closedNow();
    const reach = {
      p1: reachDistances(maze, starts.p1, closed),
      p2: reachDistances(maze, starts.p2, closed),
    };
    let changed = false;
    doors.forEach((d, i) => {
      if (open[i]) return;
      const opener = otherPlayer(d.owner);
      if ((reach[opener][d.plate] as number) >= 0) {
        open[i] = true;
        openOrder.push(i);
        openedBy[i] = opener;
        changed = true;
      }
    });
    if (!changed) {
      const solvable = (reach.p1[exit] as number) >= 0 && (reach.p2[exit] as number) >= 0;
      return { solvable, openOrder, openedBy };
    }
  }
}

/** Случайные позиции k дверей на рёбрах пути 0..edges-1 с промежутком; null — не влезают. */
function pickDoorEdges(rng: Rng, edges: number, k: number): number[] | null {
  if (k === 0) return [];
  const candidates: number[] = [];
  for (let i = MIN_DOOR_INDEX; i < edges; i++) candidates.push(i);
  rng.shuffle(candidates);
  const chosen: number[] = [];
  for (const c of candidates) {
    if (chosen.every((o) => Math.abs(o - c) >= MIN_DOOR_GAP)) chosen.push(c);
    if (chosen.length === k) return chosen.sort((a, b) => a - b);
  }
  return null;
}

/** Сколько дверей с промежутками влезает на «свой» участок пути длиной edges проходов. */
function doorCapacity(edges: number): number {
  const span = edges - MIN_DOOR_INDEX;
  return span <= 0 ? 0 : Math.floor((span - 1) / MIN_DOOR_GAP) + 1;
}

interface Route {
  /** Путь от старта до выхода. */
  path: number[];
  /**
   * Сколько первых проходов пути отдано под двери: «свой» участок (до слияния с путём
   * партнёра), а если он слишком короткий (старт игрока лежит на пути партнёра) — весь путь.
   */
  span: number;
}

function tryPlace(
  maze: Maze,
  rng: Rng,
  routes: Readonly<Record<PlayerId, Route>>,
  starts: Readonly<Record<PlayerId, number>>,
  exit: number,
  k: number,
): Door[] | null {
  // 1. Двери на своих участках путей, по порядку от старта.
  const byOwner: Record<PlayerId, Door[]> = { p1: [], p2: [] };
  for (const owner of ['p1', 'p2'] as const) {
    const { path, span } = routes[owner];
    const count = Math.min(k, doorCapacity(span));
    const edges = pickDoorEdges(rng, span, count);
    if (edges === null) return null;
    byOwner[owner] = edges.map((i) => ({
      a: path[i] as number,
      b: path[i + 1] as number,
      owner,
      plate: -1,
      open: false,
      openedAtMs: null,
    }));
  }

  // 2. Плита i-й двери владельца — в зоне партнёра, когда у партнёра открыты двери 1..i-1
  //    (все двери владельца закрыты). Так решаемость гарантирована по индукции.
  const taken = new Set<number>([starts.p1, starts.p2, exit]);
  for (const d of [...byOwner.p1, ...byOwner.p2]) {
    taken.add(d.a);
    taken.add(d.b);
  }
  const maxK = Math.max(byOwner.p1.length, byOwner.p2.length);
  for (let i = 0; i < maxK; i++) {
    for (const owner of ['p1', 'p2'] as const) {
      const door = byOwner[owner][i];
      if (!door) continue;
      const partner = otherPlayer(owner);
      const closed = new Set<number>();
      for (const d of byOwner[owner]) closed.add(edgeKey(d.a, d.b));
      byOwner[partner].forEach((d, j) => {
        if (j >= i) closed.add(edgeKey(d.a, d.b));
      });
      const zone = reachDistances(maze, starts[partner], closed);
      const fromA = reachDistances(maze, door.a, new Set());
      const fromB = reachDistances(maze, door.b, new Set());
      const candidates: number[] = [];
      for (let c = 0; c < zone.length; c++) {
        if ((zone[c] as number) < 0 || taken.has(c)) continue;
        if (Math.min(fromA[c] as number, fromB[c] as number) < MIN_PLATE_DISTANCE) continue;
        candidates.push(c);
      }
      if (candidates.length === 0) return null;
      // Плита у самого старта партнёра — скучно: по возможности подальше от него.
      const far = candidates.filter((c) => (zone[c] as number) >= MIN_PLATE_DISTANCE);
      door.plate = rng.pick(far.length > 0 ? far : candidates);
      taken.add(door.plate);
    }
  }
  return [...byOwner.p1, ...byOwner.p2];
}

/**
 * Детерминированно расставляет двери и плиты в идеальном лабиринте. Каждая расстановка
 * проверяется решателем; при неудаче — следующие числа Rng, после ATTEMPTS — на дверь меньше.
 */
export function placeDoors(
  maze: Maze,
  seed: number,
  starts: Readonly<Record<PlayerId, number>>,
  exit: number,
  doorsPerPlayer: number,
): Door[] {
  // generateMaze уже использует Rng(seed) — берём независимый поток.
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const path1 = pathBetween(maze, starts.p1, exit);
  const path2 = pathBetween(maze, starts.p2, exit);
  const ownLength = (path: number[], other: number[]) => {
    const shared = new Set(other);
    const j = path.findIndex((c) => shared.has(c));
    return j < 0 ? path.length - 1 : j;
  };
  const own = { p1: ownLength(path1, path2), p2: ownLength(path2, path1) };
  // Короткий «свой» участок бывает, когда путь одного игрока к выходу проходит через старт
  // (или рядом со стартом) другого. Тогда двери короткого ставим на весь его путь — общий
  // участок с партнёром; у партнёра двери остаются на своём участке, рёбра не пересекаются.
  const short: PlayerId = own.p1 <= own.p2 ? 'p1' : 'p2';
  const spanOf = (id: PlayerId, path: number[]) =>
    id === short && doorCapacity(own[id]) < doorsPerPlayer ? path.length - 1 : own[id];
  const routes: Record<PlayerId, Route> = {
    p1: { path: path1, span: spanOf('p1', path1) },
    p2: { path: path2, span: spanOf('p2', path2) },
  };
  for (let k = doorsPerPlayer; k > 0; k--) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const doors = tryPlace(maze, rng, routes, starts, exit, k);
      if (doors && solveDoors(maze, doors, starts, exit).solvable) return doors;
    }
  }
  return [];
}
