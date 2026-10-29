// Бот-игрок для тестов: pnpm bot --host 127.0.0.1 [--port 47777] [--game maze] [--name Бот] [--rounds N] [--delay мс]
// Подключается, жмёт «готов», в лабиринте идёт к сопернику по BFS (видит весь лабиринт).
// Выходит после N раундов (--rounds) или по окончании матча.
import { parseArgs } from 'node:util';
import { DEFAULT_PORT, maze, type PlayerId } from '@2dots/core';
import { createGameClient } from '@2dots/net/client';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: String(DEFAULT_PORT) },
    game: { type: 'string', default: 'maze' },
    name: { type: 'string', default: 'Бот' },
    /** 0 — играть до конца матча. */
    rounds: { type: 'string', default: '0' },
    /** Задержка перед началом движения в каждом раунде — чтобы один бот проигрывал другому. */
    delay: { type: 'string', default: '0' },
    quiet: { type: 'boolean', default: false },
  },
});

const host = values.host;
const port = Number(values.port);
const gameId = values.game;
const maxRounds = Number(values.rounds);
const startDelayMs = Number(values.delay);

const DIRS: readonly maze.Dir[] = ['up', 'right', 'down', 'left'];
const DELTA: Record<maze.Dir, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

function canMove(m: maze.Maze, x: number, y: number, dir: maze.Dir): boolean {
  const [dx, dy] = DELTA[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) return false;
  return ((m.walls[y * m.width + x] ?? 0) & maze.WALL[dir]) === 0;
}

/** Первый шаг кратчайшего пути из from в to по стенам лабиринта; null — уже на месте или пути нет. */
function bfsFirstStep(m: maze.Maze, from: [number, number], to: [number, number]): maze.Dir | null {
  const w = m.width;
  const start = from[1] * w + from[0];
  const goal = to[1] * w + to[0];
  if (start === goal) return null;
  // firstDir[cell] — каким направлением мы вышли из старта на пути к cell.
  const firstDir = new Array<maze.Dir | null>(w * m.height).fill(null);
  const seen = new Uint8Array(w * m.height);
  seen[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] as number;
    const x = cell % w;
    const y = (cell - x) / w;
    for (const dir of DIRS) {
      if (!canMove(m, x, y, dir)) continue;
      const [dx, dy] = DELTA[dir];
      const next = (y + dy) * w + (x + dx);
      if (seen[next]) continue;
      seen[next] = 1;
      const first = cell === start ? dir : (firstDir[cell] ?? null);
      firstDir[next] = first;
      if (next === goal) return first;
      queue.push(next);
    }
  }
  return null;
}

/** Направление, которое бот «держит»: считаем от клетки, в которую игрок уже движется. */
function chooseDir(state: maze.MazeState, you: PlayerId): maze.Dir | null {
  const me = state.players[you];
  const other = state.players[you === 'p1' ? 'p2' : 'p1'];
  let from: [number, number] = [me.x, me.y];
  if (
    me.dir &&
    me.moveProgress > maze.LATE_TURN_WINDOW &&
    canMove(state.maze, me.x, me.y, me.dir)
  ) {
    const [dx, dy] = DELTA[me.dir];
    from = [me.x + dx, me.y + dy];
  }
  return bfsFirstStep(state.maze, from, [other.x, other.y]) ?? me.dir;
}

function log(...args: unknown[]): void {
  console.log(`[${values.name}]`, ...args);
}

async function main(): Promise<void> {
  const client = createGameClient();
  let playing = false;
  let currentGame = '';
  let lastDir: maze.Dir | null | undefined;
  let rounds = 0;
  let lastLoggedTick = 0;
  let moveAt = 0;

  client.on('lobby', (lobby) => {
    currentGame = lobby.gameId;
    if (client.you === 'p1' && lobby.gameId !== gameId) {
      client.selectGame(gameId);
      return;
    }
    const me = lobby.players.find((p) => p.id === client.you);
    if (!playing && me && !me.ready) client.setReady(true);
  });

  client.on('start', (msg) => {
    playing = true;
    currentGame = msg.gameId;
    lastDir = undefined;
    lastLoggedTick = 0;
    moveAt = performance.now() + msg.countdownMs + startDelayMs;
    log(`раунд ${rounds + 1}: старт ${msg.gameId}, seed=${msg.seed}, отсчёт ${msg.countdownMs} мс`);
  });

  client.on('state', (msg) => {
    if (!playing || !client.you || performance.now() < moveAt) return;
    if (currentGame === 'maze') {
      const state = msg.state as maze.MazeState;
      const dir = chooseDir(state, client.you);
      if (dir !== lastDir) {
        lastDir = dir;
        client.sendInput({ dir } satisfies maze.MazeInput);
      }
      if (!values.quiet && msg.tick - lastLoggedTick >= 30) {
        lastLoggedTick = msg.tick;
        const me = state.players[client.you];
        log(`тик ${msg.tick}: (${me.x},${me.y}) держу ${dir ?? '—'}`);
      }
    } else if (currentGame === 'counter') {
      client.sendInput({ inc: 1 });
    }
  });

  client.on('end', (msg) => {
    playing = false;
    rounds++;
    log(`раунд ${rounds} окончен:`, JSON.stringify(msg.result), 'матч', JSON.stringify(msg.match));
    if (msg.matchWinner || (maxRounds > 0 && rounds >= maxRounds)) {
      log(msg.matchWinner ? `матч выиграл ${msg.matchWinner}` : `сыграно раундов: ${rounds}`);
      client.disconnect();
      return;
    }
    client.rematch();
  });

  client.on('aborted', () => {
    playing = false;
    log('раунд прерван: соперник отключился, ждём в лобби');
  });

  client.on('error', (msg) => log(`ошибка сервера ${msg.code}: ${msg.message}`));

  const done = new Promise<void>((resolve) => {
    client.on('disconnect', ({ reason }) => {
      log(`отключён: ${reason}`);
      resolve();
    });
  });

  const you = await client.connect(host, port, values.name);
  log(`подключён к ${host}:${port} как ${you}`);
  if (you === 'p1') client.selectGame(gameId);
  client.setReady(true);
  await done;
}

main().catch((err: unknown) => {
  console.error(`[${values.name}]`, err instanceof Error ? err.message : err);
  process.exit(1);
});
