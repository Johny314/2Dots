import { afterEach, describe, expect, it } from 'vitest';
import { MATCH_WINS, type AnyMiniGame, type MiniGame } from '@2dots/core';
import { counterGame } from '@2dots/core/testing';
import type { GameClient } from './client';
import { createGameClient } from './game-client';
import { startHostServer, type HostServerHandle, type HostServerOptions } from './host-server';
import { connectClient, hello, rawConnect, waitFor } from './test-utils';

const games = { counter: counterGame as AnyMiniGame };

let server: HostServerHandle | null = null;
const clients: GameClient[] = [];

async function start(options: HostServerOptions = {}): Promise<HostServerHandle> {
  server = await startHostServer({ port: 0, countdownMs: 0, games, ...options });
  return server;
}

async function join(port: number, name: string): Promise<GameClient> {
  const client = await connectClient(port, name);
  clients.push(client);
  return client;
}

/** Оба игрока жмут «готов» и дожидаются старта. */
async function startRound(a: GameClient, b: GameClient) {
  const started = Promise.all([waitFor(a, 'start'), waitFor(b, 'start')]);
  a.setReady(true);
  b.setReady(true);
  return started;
}

/** Игрок winner жмёт +1 на каждый state, пока раунд не закончится. */
async function playRound(winner: GameClient, other: GameClient) {
  const offs = [winner.on('state', () => winner.sendInput({ inc: 1 }))];
  const ends = Promise.all([waitFor(winner, 'end'), waitFor(other, 'end')]);
  try {
    return await ends;
  } finally {
    offs.forEach((off) => off());
  }
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server?.stop();
  server = null;
});

describe('лобби', () => {
  it('выдаёт p1 и p2 и рассылает лобби с выбранной игрой', async () => {
    const { port } = await start();
    const a = await join(port, 'Аня');
    expect(a.you).toBe('p1');
    expect(a.status).toBe('connected');

    const lobbyWithTwo = waitFor(a, 'lobby', (m) => m.players.length === 2);
    const b = await join(port, 'Боря');
    expect(b.you).toBe('p2');
    const lobby = await lobbyWithTwo;
    expect(lobby.gameId).toBe('counter');
    expect(lobby.match).toEqual({ p1: 0, p2: 0 });
    expect(lobby.players).toEqual([
      { id: 'p1', name: 'Аня', ready: false, connected: true },
      { id: 'p2', name: 'Боря', ready: false, connected: true },
    ]);

    const readyLobby = waitFor(b, 'lobby', (m) => m.players[0]?.ready === true);
    a.setReady(true);
    await readyLobby;
  });

  it('по умолчанию выбирает maze из реестра', async () => {
    const { port } = await start({ games: undefined });
    const lobby = await createClientAndWaitLobby(port);
    expect(lobby.gameId).toBe('maze');
  });

  it('третий игрок получает full', async () => {
    const { port } = await start();
    await join(port, 'A');
    await join(port, 'B');
    const raw = await rawConnect(port);
    raw.send(hello('C'));
    expect(await raw.next()).toMatchObject({ t: 'error', code: 'full' });
    await raw.closed;
  });

  it('неверная версия протокола → version и закрытие', async () => {
    const { port } = await start();
    const raw = await rawConnect(port);
    raw.send(hello('A', 999));
    expect(await raw.next()).toMatchObject({ t: 'error', code: 'version' });
    await raw.closed;
  });

  it('мусорное сообщение → bad_msg, соединение остаётся', async () => {
    const { port } = await start();
    const raw = await rawConnect(port);
    raw.send('{не json');
    expect(await raw.next()).toMatchObject({ t: 'error', code: 'bad_msg' });
    raw.send({ t: 'ready', ready: true });
    expect(await raw.next()).toMatchObject({ t: 'error', code: 'bad_msg' });
    raw.send({ t: 'nope' });
    expect(await raw.next()).toMatchObject({ t: 'error', code: 'bad_msg' });
    raw.send(hello('A'));
    expect(await raw.next()).toMatchObject({ t: 'welcome', you: 'p1' });
    raw.send({ t: 'hello', v: 1, name: '' });
    expect(await raw.next((m) => m.t === 'error')).toMatchObject({ code: 'bad_msg' });
    raw.close();
  });

  it('выбор игры: только хост и только известная игра', async () => {
    const other: MiniGame<unknown, unknown, unknown, unknown> = { ...games.counter, id: 'other' };
    const { port } = await start({ games: { ...games, other } });
    const a = await join(port, 'A');
    const b = await join(port, 'B');

    const notHost = waitFor(b, 'error');
    b.selectGame('other');
    expect((await notHost).code).toBe('not_host');

    const unknown = waitFor(a, 'error');
    a.selectGame('chess');
    expect((await unknown).code).toBe('unknown_game');

    const selected = waitFor(b, 'lobby', (m) => m.gameId === 'other');
    a.selectGame('other');
    await selected;
  });
});

describe('раунд и матч', () => {
  it('start, state и end с seed от сервера', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const [startA, startB] = await startRound(a, b);
    expect(startA.gameId).toBe('counter');
    expect(startA.countdownMs).toBe(0);
    expect(startA.config).toEqual({ target: 5 });
    expect(startA.seed).toBe(startB.seed);
    expect(Number.isInteger(startA.seed)).toBe(true);

    const [endA] = await playRound(b, a);
    expect(endA.result).toEqual({ winner: 'p2' });
    expect(endA.match).toEqual({ p1: 0, p2: 1 });
    expect(endA.matchWinner).toBeNull();
  });

  it(`полный матч до ${MATCH_WINS} побед, затем новый матч`, async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');

    await startRound(a, b);
    let end = (await playRound(a, b))[0];
    for (let round = 2; round <= MATCH_WINS; round++) {
      expect(end.matchWinner).toBeNull();
      const started = Promise.all([waitFor(a, 'start'), waitFor(b, 'start')]);
      a.rematch();
      b.rematch();
      await started;
      end = (await playRound(a, b))[0];
    }
    expect(end.match).toEqual({ p1: MATCH_WINS, p2: 0 });
    expect(end.matchWinner).toBe('p1');

    // После победы в матче счёт обнуляется со следующим раундом.
    await startRound(a, b);
    end = (await playRound(b, a))[0];
    expect(end.match).toEqual({ p1: 0, p2: 1 });
  });

  it('новый матч: лобби до start несёт счёт 0:0, а не итог прошлого матча', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    await startRound(a, b);
    let end = (await playRound(a, b))[0];
    while (!end.matchWinner) {
      const started = Promise.all([waitFor(a, 'start'), waitFor(b, 'start')]);
      a.rematch();
      b.rematch();
      await started;
      end = (await playRound(a, b))[0];
    }
    expect(end.match).toEqual({ p1: MATCH_WINS, p2: 0 });

    // Запоминаем все lobby у гостя до start нового матча.
    const lobbies: { p1: number; p2: number }[] = [];
    const off = b.on('lobby', (m) => lobbies.push({ ...m.match }));
    const firstLobby = waitFor(b, 'lobby');
    a.rematch();
    // Первое «Новый матч» сразу обнуляет счёт в лобби.
    expect((await firstLobby).match).toEqual({ p1: 0, p2: 0 });
    const started = waitFor(b, 'start');
    b.rematch();
    await started;
    off();
    expect(lobbies.length).toBeGreaterThan(0);
    expect(lobbies.at(-1)).toEqual({ p1: 0, p2: 0 });
  });

  it('лобби перед start: готовность сброшена', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    let last: { ready: boolean }[] = [];
    const off = a.on('lobby', (m) => (last = m.players));
    await startRound(a, b);
    off();
    expect(last.map((p) => p.ready)).toEqual([false, false]);
  });

  it('maze из реестра: start и state с лабиринтом из того же seed', async () => {
    const { port } = await start({ games: undefined });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const firstState = waitFor(a, 'state', (m) => m.tick > 0);
    const [st] = await startRound(a, b);
    expect(st.gameId).toBe('maze');
    const { state } = await firstState;
    expect(state).toMatchObject({ seed: st.seed, config: st.config });
    expect((state as { maze: { walls: number[] } }).maze.walls.length).toBeGreaterThan(0);
  });

  it('ничья не даёт очков', async () => {
    const drawGame: MiniGame<null, { t: number }, null, { winner: 'draw' }> = {
      id: 'draw',
      title: 'Ничья',
      tickHz: 60,
      defaultConfig: () => null,
      init: () => ({ t: 0 }),
      parseInput: () => null,
      applyInput: () => {},
      tick: (s) => {
        s.t++;
      },
      result: (s) => (s.t >= 3 ? { winner: 'draw' } : null),
    };
    const { port } = await start({ games: { draw: drawGame as AnyMiniGame } });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const ended = waitFor(a, 'end');
    await startRound(a, b);
    const end = await ended;
    expect(end.result).toEqual({ winner: 'draw' });
    expect(end.match).toEqual({ p1: 0, p2: 0 });
    expect(end.matchWinner).toBeNull();
  });

  it('тикает с dt = 1000 / tickHz и номерами тиков по порядку', async () => {
    const dts: number[] = [];
    const tickGame: MiniGame<null, { n: number }, null, { winner: 'p1' }> = {
      id: 'ticks',
      title: 'Тики',
      tickHz: 50,
      defaultConfig: () => null,
      init: () => ({ n: 0 }),
      parseInput: () => null,
      applyInput: () => {},
      tick: (s, dt) => {
        dts.push(dt);
        s.n++;
      },
      result: (s) => (s.n >= 10 ? { winner: 'p1' } : null),
    };
    const { port } = await start({ games: { ticks: tickGame as AnyMiniGame } });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const ticks: number[] = [];
    a.on('state', (m) => ticks.push(m.tick));
    const ended = waitFor(a, 'end');
    const t0 = performance.now();
    await startRound(a, b);
    await ended;
    const elapsed = performance.now() - t0;
    expect(dts).toEqual(new Array(10).fill(20));
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(10);
    expect([...ticks].sort((x, y) => x - y)).toEqual(ticks);
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it('некорректный ввод → bad_msg, раунд продолжается', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    await startRound(a, b);
    const err = waitFor(a, 'error');
    a.sendInput({ inc: 100 });
    expect((await err).code).toBe('bad_msg');
    const [end] = await playRound(a, b);
    expect(end.result).toEqual({ winner: 'p1' });
  });

  it('ввод во время отсчёта применяется в момент старта', async () => {
    const { port } = await start({ countdownMs: 150 });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const [st] = await startRound(a, b);
    expect(st.countdownMs).toBe(150);
    a.sendInput({ inc: 1 });
    a.sendInput({ inc: 0 });
    a.sendInput({ inc: 1 });
    const state = await waitFor(a, 'state', (m) => m.tick > 0);
    expect(state.state).toMatchObject({ counts: { p1: 1, p2: 0 } });
  });
});

describe('обрыв соединения', () => {
  it('обрыв в раунде → aborted оставшемуся, раунд не засчитан, слот свободен', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');

    // Сначала p1 выигрывает один раунд — счёт 1:0.
    await startRound(a, b);
    await playRound(a, b);

    const started = waitFor(a, 'start');
    a.rematch();
    b.rematch();
    await started;

    const aborted = waitFor(a, 'aborted');
    const lobby = waitFor(a, 'lobby', (m) => m.players.length === 1);
    b.disconnect();
    expect(await aborted).toEqual({ t: 'aborted', reason: 'disconnect' });
    const l = await lobby;
    expect(l.players).toEqual([{ id: 'p1', name: 'A', ready: false, connected: true }]);
    expect(l.match).toEqual({ p1: 0, p2: 0 });

    // Вернувшийся игрок заходит заново через hello и получает освободившийся слот.
    const c = await join(port, 'C');
    expect(c.you).toBe('p2');
    await startRound(a, c);
    const [end] = await playRound(c, a);
    expect(end.match).toEqual({ p1: 0, p2: 1 });
  });

  it('обрыв хоста в лобби освобождает p1', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const lobby = waitFor(b, 'lobby', (m) => m.players.length === 1);
    a.disconnect();
    expect((await lobby).players[0]?.id).toBe('p2');
    const c = await join(port, 'C');
    expect(c.you).toBe('p1');
  });

  it('stop() закрывает соединения клиентов', async () => {
    const { port } = await start();
    const a = await join(port, 'A');
    const gone = waitFor(a, 'disconnect');
    await server?.stop();
    server = null;
    await gone;
    expect(a.status).toBe('closed');
  });
});

async function createClientAndWaitLobby(port: number) {
  const client = createGameClient();
  clients.push(client);
  const lobby = waitFor(client, 'lobby');
  await client.connect('127.0.0.1', port, 'A');
  return lobby;
}
