import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PORT } from '@2dots/core';
import type { HostServerHandle } from '@2dots/net';
import {
  configuredPort,
  createHostController,
  localIPv4s,
  publishName,
  type HostDeps,
} from './host';

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

function v6(address: string): NetworkInterfaceInfo {
  return {
    address,
    netmask: 'ffff:ffff:ffff:ffff::',
    family: 'IPv6',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: `${address}/64`,
    scopeid: 0,
  };
}

describe('localIPv4s', () => {
  it('отбрасывает loopback, link-local, internal и IPv6', () => {
    expect(
      localIPv4s({
        lo0: [v4('127.0.0.1', true)],
        en0: [v6('fe80::1'), v4('192.168.1.10')],
        en5: [v4('169.254.10.20')],
        weird: [v4('127.0.1.1')],
      }),
    ).toEqual(['192.168.1.10']);
  });

  it('принимает family числом 4 (старые версии Node)', () => {
    const info = { ...v4('10.0.0.5'), family: 4 } as unknown as NetworkInterfaceInfo;
    expect(localIPv4s({ eth0: [info] })).toEqual(['10.0.0.5']);
  });

  it('ставит виртуальные адаптеры в конец, сохраняя порядок остальных', () => {
    expect(
      localIPv4s({
        'vEthernet (WSL)': [v4('172.20.0.1')],
        utun3: [v4('10.8.0.2')],
        'Wi-Fi': [v4('192.168.0.42')],
        docker0: [v4('172.17.0.1')],
        Ethernet: [v4('192.168.0.43')],
        'VirtualBox Host-Only Network': [v4('192.168.56.1')],
      }),
    ).toEqual([
      '192.168.0.42',
      '192.168.0.43',
      '172.20.0.1',
      '10.8.0.2',
      '172.17.0.1',
      '192.168.56.1',
    ]);
  });

  it('убирает дубликаты и переживает пустые записи', () => {
    expect(
      localIPv4s({ en0: [v4('192.168.1.2')], en1: [v4('192.168.1.2')], en2: undefined }),
    ).toEqual(['192.168.1.2']);
  });
});

describe('configuredPort', () => {
  it('по умолчанию DEFAULT_PORT, некорректное значение игнорируется', () => {
    expect(configuredPort(undefined)).toBe(DEFAULT_PORT);
    expect(configuredPort('')).toBe(DEFAULT_PORT);
    expect(configuredPort('abc')).toBe(DEFAULT_PORT);
    expect(configuredPort('70000')).toBe(DEFAULT_PORT);
    expect(configuredPort('0')).toBe(0);
    expect(configuredPort('5000')).toBe(5000);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<HostDeps> = {}) {
  const servers: { port: number; stop: ReturnType<typeof vi.fn> }[] = [];
  const unpublish = vi.fn();
  const deps: HostDeps = {
    startHostServer: vi.fn(async () => {
      const server = { port: 40000 + servers.length, stop: vi.fn(async () => undefined) };
      servers.push(server);
      return server satisfies HostServerHandle;
    }),
    publishHost: vi.fn(() => unpublish),
    findHosts: vi.fn(async () => []),
    localIPv4s: () => ['192.168.1.10'],
    displayName: () => 'test',
    port: () => 0,
    warn: vi.fn(),
    ...overrides,
  };
  return { deps, servers, unpublish, host: createHostController(deps) };
}

describe('hostStart / hostStop', () => {
  it('hostStart возвращает порт и IP, публикует mDNS', async () => {
    const { host, deps } = setup();
    await expect(host.hostStart('')).resolves.toEqual({ port: 40000, ips: ['192.168.1.10'] });
    expect(deps.startHostServer).toHaveBeenCalledWith({ port: 0 });
    expect(deps.publishHost).toHaveBeenCalledWith('test', 40000);
    expect(host.isHosting()).toBe(true);
  });

  it('mDNS-публикация идёт под именем игрока', async () => {
    const { host, deps } = setup();
    await host.hostStart('  Аня  ');
    expect(deps.publishHost).toHaveBeenCalledWith('Аня', 40000);
  });

  it('повторный и параллельный hostStart не поднимают второй сервер', async () => {
    const { host, deps } = setup();
    const [a, b] = await Promise.all([host.hostStart(''), host.hostStart('')]);
    const c = await host.hostStart('');
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    expect(deps.startHostServer).toHaveBeenCalledTimes(1);
  });

  it('hostStop останавливает сервер и снимает публикацию; повторный вызов безопасен', async () => {
    const { host, servers, unpublish } = setup();
    await host.hostStop();
    await host.hostStart('');
    await host.hostStop();
    await host.hostStop();
    expect(servers[0]?.stop).toHaveBeenCalledTimes(1);
    expect(unpublish).toHaveBeenCalledTimes(1);
    expect(host.isHosting()).toBe(false);
  });

  it('после hostStop можно снова поднять хост', async () => {
    const { host, deps } = setup();
    await host.hostStart('');
    await host.hostStop();
    await expect(host.hostStart('')).resolves.toMatchObject({ port: 40001 });
    expect(deps.startHostServer).toHaveBeenCalledTimes(2);
  });

  it('hostStop во время запуска: hostStart отклоняется, сервер остановлен', async () => {
    const gate = deferred<void>();
    const { host, servers, deps } = setup();
    const start = deps.startHostServer;
    deps.startHostServer = vi.fn(async (options) => {
      await gate.promise;
      return start(options);
    });
    const starting = host.hostStart('');
    const stopping = host.hostStop();
    gate.resolve();
    await expect(starting).rejects.toThrow('остановлен');
    await stopping;
    expect(servers[0]?.stop).toHaveBeenCalledTimes(1);
    expect(host.isHosting()).toBe(false);
  });

  it('ошибка запуска сервера пробрасывается, состояние сбрасывается', async () => {
    const { host } = setup({
      startHostServer: vi.fn(async () => Promise.reject(new Error('EADDRINUSE'))),
    });
    await expect(host.hostStart('')).rejects.toThrow('EADDRINUSE');
    expect(host.isHosting()).toBe(false);
    await expect(host.hostStop()).resolves.toBeUndefined();
  });

  it('сбой mDNS-публикации не мешает хосту', async () => {
    const { host, deps } = setup({
      publishHost: vi.fn(() => {
        throw new Error('no multicast');
      }),
    });
    await expect(host.hostStart('')).resolves.toMatchObject({ port: 40000 });
    expect(deps.warn).toHaveBeenCalled();
    await host.hostStop();
  });
});

describe('discoverHosts', () => {
  it('возвращает найденные хосты', async () => {
    const found = [{ name: 'a', ip: '192.168.1.3', port: 47777 }];
    const { host } = setup({ findHosts: vi.fn(async () => found) });
    await expect(host.discoverHosts()).resolves.toEqual(found);
  });

  it('ошибка mDNS превращается в пустой список', async () => {
    const { host } = setup({ findHosts: vi.fn(async () => Promise.reject(new Error('boom'))) });
    await expect(host.discoverHosts()).resolves.toEqual([]);
  });
});

describe('publishName', () => {
  it('имя игрока обрезается до 24 символов, пустое — имя компьютера', () => {
    expect(publishName('Женя', () => 'mac')).toBe('Женя');
    expect(publishName('   ', () => 'mac')).toBe('mac');
    expect(publishName('x'.repeat(30), () => 'mac')).toBe('x'.repeat(24));
  });
});
