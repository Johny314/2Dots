import type { MiniGame, PlayerId } from '../../minigame';
import { generateMaze } from './generate';
import { DELTA, DIRS, OPPOSITE, bfsDistances, canMove, visibleCells } from './grid';
import type { Dir, Maze, MazeConfig, MazeInput, MazePlayer, MazeResult, MazeState } from './types';

export * from './types';
export { generateMaze } from './generate';
export { DELTA, DIRS, OPPOSITE, bfsDistances, canMove, inBounds, visibleCells } from './grid';
/** Синоним visibleCells (название из docs/PLAN.md). */
export const fogVisible = visibleCells;

/** Радиус тумана, когда хост его включает. */
export const DEFAULT_FOG_RADIUS = 3;
/** Допустимые радиусы тумана в настройках. */
const FOG_RADIUS_RANGE = [1, 8] as const;

/** Расстояние по проходам лабиринта между двумя клетками (-1 — недостижимо). */
export function pathDistance(maze: Maze, from: [number, number], to: [number, number]): number {
  return bfsDistances(maze, from[0], from[1])[to[1] * maze.width + to[0]] ?? -1;
}

/** Максимальный путь игрока за один подшаг тика — защита от «проскока» навстречу. */
const MAX_SUBSTEP_CELLS = 0.5;

/** Стартовые клетки: p1 — левый верхний угол, p2 — правый нижний. */
export function startCell(
  maze: Pick<Maze, 'width' | 'height'>,
  player: PlayerId,
): [number, number] {
  return player === 'p1' ? [0, 0] : [maze.width - 1, maze.height - 1];
}

function makePlayer(x: number, y: number, width: number): MazePlayer {
  return { x, y, dir: null, queued: null, moveProgress: 0, visited: [y * width + x], steps: 0 };
}

/**
 * Направление на перекрёстке (в центре клетки): удерживаемое, если туда можно пройти;
 * иначе продолжаем текущее (буфер поворота, как в Pac-Man); ничего не удерживается — стоп.
 */
function chooseDir(maze: Maze, p: MazePlayer): Dir | null {
  if (p.queued === null) return null;
  if (canMove(maze, p.x, p.y, p.queued)) return p.queued;
  if (p.dir !== null && canMove(maze, p.x, p.y, p.dir)) return p.dir;
  return null;
}

/**
 * Мгновенный разворот: удерживается направление, противоположное движению, посреди перехода
 * A → B. Игрок разворачивается на месте: теперь он идёт B → A с прогрессом 1 − moveProgress
 * (физическая позиция не меняется). Клетка B ещё не достигнута — в visited и steps не попадает.
 */
function reverseIfOpposite(p: MazePlayer): void {
  if (p.dir === null || p.moveProgress <= 0 || p.queued !== OPPOSITE[p.dir]) return;
  const [dx, dy] = DELTA[p.dir];
  p.x += dx;
  p.y += dy;
  p.dir = p.queued;
  p.moveProgress = 1 - p.moveProgress;
}

/** Продвигает игрока на budget клеток. Повороты — в центре клетки, разворот — сразу. */
function advance(maze: Maze, p: MazePlayer, budget: number): void {
  reverseIfOpposite(p);
  let left = budget;
  while (left > 0) {
    if (p.moveProgress === 0) {
      p.dir = chooseDir(maze, p);
      if (p.dir === null) return;
    }
    const dir = p.dir as Dir;
    const need = 1 - p.moveProgress;
    if (left < need) {
      p.moveProgress += left;
      return;
    }
    left -= need;
    const [dx, dy] = DELTA[dir];
    p.x += dx;
    p.y += dy;
    p.moveProgress = 0;
    p.steps++;
    const cell = p.y * maze.width + p.x;
    if (!p.visited.includes(cell)) p.visited.push(cell);
  }
}

/** Встреча: одна клетка или соседние клетки без стены между ними. */
function haveMet(maze: Maze, a: MazePlayer, b: MazePlayer): boolean {
  if (a.x === b.x && a.y === b.y) return true;
  return DIRS.some((dir) => {
    const [dx, dy] = DELTA[dir];
    return a.x + dx === b.x && a.y + dy === b.y && canMove(maze, a.x, a.y, dir);
  });
}

function scoreOf(state: MazeState, player: PlayerId, distFromStart: number[]): number {
  const p = state.players[player];
  switch (state.config.scoring) {
    case 'distinct':
      return p.visited.length;
    case 'steps':
      return p.steps;
    case 'bfs':
      return Math.max(0, distFromStart[p.y * state.maze.width + p.x] as number);
  }
}

function finish(state: MazeState, reason: MazeResult['reason']): MazeResult {
  const { maze, players } = state;
  const [x1, y1] = startCell(maze, 'p1');
  const [x2, y2] = startCell(maze, 'p2');
  const d1 = bfsDistances(maze, x1, y1);
  const d2 = bfsDistances(maze, x2, y2);
  const scores = { p1: scoreOf(state, 'p1', d1), p2: scoreOf(state, 'p2', d2) };
  const winner: MazeResult['winner'] =
    reason === 'timeout' || scores.p1 === scores.p2 ? 'draw' : scores.p1 > scores.p2 ? 'p1' : 'p2';

  let meetCell: [number, number] | null = null;
  if (reason === 'met') {
    // Соседние клетки: точка встречи — та, что ближе к «середине» пути между стартами
    // (|d1 − d2| меньше); при равенстве — клетка p1.
    const a = players.p1;
    const b = players.p2;
    const imbalance = (p: MazePlayer) => {
      const i = p.y * maze.width + p.x;
      return Math.abs((d1[i] as number) - (d2[i] as number));
    };
    meetCell = imbalance(b) < imbalance(a) ? [b.x, b.y] : [a.x, a.y];
  }

  return {
    winner,
    reason,
    scores,
    meetCell,
    pathLength: Math.max(0, d1[y2 * maze.width + x2] as number),
    scoring: state.config.scoring,
    totalCells: maze.width * maze.height,
  };
}

export const mazeGame: MiniGame<MazeConfig, MazeState, MazeInput, MazeResult> = {
  id: 'maze',
  title: 'Лабиринт',
  tickHz: 30,

  defaultConfig: () => ({
    width: 21,
    height: 15,
    speedCellsPerSec: 7,
    fogRadius: DEFAULT_FOG_RADIUS,
    timeLimitMs: 180_000,
    scoring: 'distinct',
    braid: 0,
    hotCold: false,
  }),

  parseConfig(raw, base) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { fogRadius, hotCold } = raw as { fogRadius?: unknown; hotCold?: unknown };
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
    if (hotCold !== undefined) {
      if (typeof hotCold !== 'boolean') return null;
      next.hotCold = hotCold;
    }
    return next;
  },

  init(seed, _players, config) {
    const maze = generateMaze(seed, config.width, config.height, config.braid);
    const [x1, y1] = startCell(maze, 'p1');
    const [x2, y2] = startCell(maze, 'p2');
    return {
      seed,
      config,
      maze,
      tick: 0,
      elapsedMs: 0,
      players: {
        p1: makePlayer(x1, y1, maze.width),
        p2: makePlayer(x2, y2, maze.width),
      },
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
    state.players[player].queued = input.dir;
  },

  tick(state, dtMs) {
    if (state.result) return;
    state.tick++;
    state.elapsedMs += dtMs;

    // Движение дробится на подшаги ≤ MAX_SUBSTEP_CELLS, встреча проверяется после каждого:
    // так игроки не проскочат друг сквозь друга даже при большом dt.
    const budget = Math.max(0, (state.config.speedCellsPerSec * dtMs) / 1000);
    const substeps = Math.max(1, Math.ceil(budget / MAX_SUBSTEP_CELLS));
    const chunk = budget / substeps;
    const { p1, p2 } = state.players;
    for (let i = 0; i < substeps; i++) {
      advance(state.maze, p1, chunk);
      advance(state.maze, p2, chunk);
      if (haveMet(state.maze, p1, p2)) {
        state.result = finish(state, 'met');
        return;
      }
    }

    if (state.elapsedMs >= state.config.timeLimitMs) state.result = finish(state, 'timeout');
  },

  result: (state) => state.result,
};
