import { createServer, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { AnyMiniGame } from '@2dots/core';
import { counterGame } from '@2dots/core/testing';
import { createGameClient } from './game-client';
import { startHostServer, type HostServerHandle } from './host-server';
import { HOST, connectClient, waitFor } from './test-utils';

let server: HostServerHandle | null = null;

afterEach(async () => {
  await server?.stop();
  server = null;
});

/** Порт, на котором точно никто не слушает. */
async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, HOST, () => r()));
  const { port } = srv.address() as AddressInfo;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

describe('GameClient', () => {
  it('реджектит connect, если сервера нет, и переходит в closed', async () => {
    const client = createGameClient();
    expect(client.status).toBe('idle');
    const port = await freePort();
    await expect(client.connect(HOST, port, 'A')).rejects.toThrow();
    expect(client.status).toBe('closed');
    expect(client.you).toBeNull();
  });

  it('реджектит connect при error от сервера до welcome', async () => {
    server = await startHostServer({
      port: 0,
      countdownMs: 0,
      games: { counter: counterGame as AnyMiniGame },
    });
    await connectClient(server.port, 'A');
    await connectClient(server.port, 'B');
    const third = createGameClient();
    const err = waitFor(third, 'error');
    let disconnects = 0;
    third.on('disconnect', () => disconnects++);
    await expect(third.connect(HOST, server.port, 'C')).rejects.toThrow(/full/);
    expect((await err).code).toBe('full');
    await new Promise((r) => setTimeout(r, 50));
    expect(third.status).toBe('closed');
    expect(disconnects).toBe(0);
  });

  it('disconnect() шлёт событие disconnect один раз; повторный connect работает', async () => {
    server = await startHostServer({
      port: 0,
      countdownMs: 0,
      games: { counter: counterGame as AnyMiniGame },
    });
    const client = createGameClient();
    const events: string[] = [];
    client.on('disconnect', (e) => events.push(e.reason));
    expect(await client.connect(HOST, server.port, 'A')).toBe('p1');
    client.disconnect();
    client.disconnect();
    expect(client.status).toBe('closed');
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toHaveLength(1);

    expect(await client.connect(HOST, server.port, 'A')).toBe('p1');
    expect(client.status).toBe('connected');
    client.disconnect();
  });

  it('отписка через функцию, возвращённую on()', async () => {
    server = await startHostServer({
      port: 0,
      countdownMs: 0,
      games: { counter: counterGame as AnyMiniGame },
    });
    const client = createGameClient();
    let calls = 0;
    const off = client.on('lobby', () => calls++);
    await client.connect(HOST, server.port, 'A');
    await new Promise((r) => setTimeout(r, 30));
    off();
    const b = await connectClient(server.port, 'B');
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(1);
    b.disconnect();
    client.disconnect();
  });

  it('игнорирует невалидные сообщения сервера', async () => {
    const wss = new WebSocketServer({ host: HOST, port: 0 });
    await new Promise<void>((r) => wss.once('listening', () => r()));
    wss.on('connection', (ws) => {
      ws.send('мусор');
      ws.send(JSON.stringify({ t: 'lobby', players: [], gameId: 'x', match: { p1: 0 } }));
      ws.send(JSON.stringify({ t: 'welcome', v: 1, you: 'p2' }));
    });
    const client = createGameClient();
    let lobbies = 0;
    client.on('lobby', () => lobbies++);
    expect(await client.connect(HOST, (wss.address() as AddressInfo).port, 'A')).toBe('p2');
    expect(lobbies).toBe(0);
    client.disconnect();
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((r) => wss.close(() => r()));
  });
});
