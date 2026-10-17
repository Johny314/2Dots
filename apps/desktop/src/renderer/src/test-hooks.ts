// Тестовые хуки e2e (только при ?e2e=1, его ставит main по TWODOTS_E2E=1).
// window.__twodots.autoplay = true — клиент сам ведёт свою точку к сопернику по BFS
// (как tools/bot.ts), чтобы e2e доигрывал раунд на настоящем случайном лабиринте.
import { maze, type PlayerId } from '@2dots/core';
import type { GameClient } from '@2dots/net/client';

export interface TestHooks {
  autoplay: boolean;
  /** Сколько state получено в текущем раунде. */
  states: number;
  lastState: unknown;
}

/** Направление к сопернику от клетки, в которую игрок сейчас входит. */
function chaseDir(state: maze.MazeState, you: PlayerId): maze.Dir | null {
  const me = state.players[you];
  const other = state.players[you === 'p1' ? 'p2' : 'p1'];
  let x = me.x;
  let y = me.y;
  if (me.dir && me.moveProgress > 0) {
    const [dx, dy] = maze.DELTA[me.dir];
    x += dx;
    y += dy;
  }
  const dist = maze.bfsDistances(state.maze, other.x, other.y);
  const here = dist[y * state.maze.width + x] ?? -1;
  for (const dir of maze.DIRS) {
    if (!maze.canMove(state.maze, x, y, dir)) continue;
    const [dx, dy] = maze.DELTA[dir];
    if (dist[(y + dy) * state.maze.width + x + dx] === here - 1) return dir;
  }
  return me.dir;
}

export function installTestHooks(client: GameClient): GameClient {
  const hooks: TestHooks = { autoplay: false, states: 0, lastState: null };
  (window as unknown as { __twodots: TestHooks }).__twodots = hooks;
  let gameId = '';
  let lastDir: maze.Dir | null | undefined;
  client.on('start', (msg) => {
    gameId = msg.gameId;
    hooks.states = 0;
    lastDir = undefined;
  });
  client.on('state', (msg) => {
    hooks.states++;
    hooks.lastState = msg.state;
    const you = client.you;
    if (!hooks.autoplay || !you || gameId !== 'maze') return;
    const dir = chaseDir(msg.state as maze.MazeState, you);
    if (dir !== lastDir) {
      lastDir = dir;
      client.sendInput({ dir } satisfies maze.MazeInput);
    }
  });
  return client;
}
