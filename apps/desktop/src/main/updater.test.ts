import { describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../shared/api';
import {
  compareVersions,
  latestVersionFrom,
  Updater,
  updateMode,
  type AutoUpdaterLike,
  type UpdaterDeps,
} from './updater';

describe('compareVersions', () => {
  it('сравнивает по числам, а не строкам', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.2.1')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
  });
});

describe('updateMode', () => {
  it('Windows-установщик — auto, portable — manual, Mac — manual, dev — off', () => {
    expect(updateMode({ platform: 'win32', isPackaged: true, env: {} })).toBe('auto');
    expect(
      updateMode({ platform: 'win32', isPackaged: true, env: { PORTABLE_EXECUTABLE_DIR: 'C:\\' } }),
    ).toBe('manual');
    expect(updateMode({ platform: 'darwin', isPackaged: true, env: {} })).toBe('manual');
    expect(updateMode({ platform: 'darwin', isPackaged: false, env: {} })).toBe('off');
    expect(
      updateMode({ platform: 'darwin', isPackaged: false, env: { TWODOTS_UPDATE_CHECK: '1' } }),
    ).toBe('manual');
  });
});

describe('latestVersionFrom', () => {
  it('берёт версию из tag_name', () => {
    expect(latestVersionFrom({ tag_name: 'v0.3.0' })).toBe('0.3.0');
    expect(latestVersionFrom({ tag_name: 'nightly' })).toBeNull();
    expect(latestVersionFrom(null)).toBeNull();
  });
});

function deps(overrides: Partial<UpdaterDeps> = {}) {
  const statuses: UpdateStatus[] = [];
  const d: UpdaterDeps = {
    mode: 'manual',
    currentVersion: '0.2.0',
    fetchLatest: async () => null,
    broadcast: (s) => statuses.push(s),
    log: () => undefined,
    ...overrides,
  };
  return { d, statuses };
}

describe('Updater: manual', () => {
  it('новее текущей — available; не новее — остаётся idle', async () => {
    const newer = deps({ fetchLatest: async () => '0.3.0' });
    const u1 = new Updater(newer.d);
    await u1.check();
    expect(u1.current).toEqual({ state: 'available', version: '0.3.0', mode: 'manual' });

    const same = deps({ fetchLatest: async () => '0.2.0' });
    const u2 = new Updater(same.d);
    await u2.check();
    expect(u2.current).toEqual({ state: 'idle' });
    expect(same.statuses).toEqual([]);
  });

  it('ошибка сети не меняет состояние и не бросает', async () => {
    const log = vi.fn();
    const u = new Updater(deps({ fetchLatest: () => Promise.reject(new Error('offline')), log }).d);
    await expect(u.check()).resolves.toBeUndefined();
    expect(u.current).toEqual({ state: 'idle' });
    expect(log).toHaveBeenCalled();
  });

  it('install в manual ничего не делает', () => {
    expect(new Updater(deps().d).install()).toBe(false);
  });
});

class FakeAutoUpdater implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  readonly handlers = new Map<string, (arg: never) => void>();
  checkForUpdates = vi.fn(async () => undefined);
  quitAndInstall = vi.fn();
  on(event: string, cb: (arg: never) => void): this {
    this.handlers.set(event, cb);
    return this;
  }
  emit(event: string, arg: unknown): void {
    (this.handlers.get(event) as ((a: unknown) => void) | undefined)?.(arg);
  }
}

describe('Updater: auto (Windows-установщик)', () => {
  it('скачивает сам, показывает прогресс и по кнопке ставит обновление', async () => {
    const au = new FakeAutoUpdater();
    const { d, statuses } = deps({ mode: 'auto', autoUpdater: au });
    const u = new Updater(d);
    expect(au.autoDownload).toBe(true);
    expect(au.autoInstallOnAppQuit).toBe(true);

    await u.check();
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(u.install()).toBe(false);

    au.emit('update-available', { version: '0.3.0' });
    au.emit('download-progress', { percent: 41.6 });
    au.emit('update-downloaded', { version: '0.3.0' });
    expect(statuses).toEqual([
      { state: 'downloading', version: '0.3.0', percent: 0 },
      { state: 'downloading', version: '0.3.0', percent: 42 },
      { state: 'ready', version: '0.3.0' },
    ]);

    // Скачано — повторно не проверяем.
    await u.check();
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1);

    expect(u.install()).toBe(true);
    expect(au.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('ошибка без загрузки молчит, обрыв загрузки — error', () => {
    const au = new FakeAutoUpdater();
    const u = new Updater(deps({ mode: 'auto', autoUpdater: au }).d);
    au.emit('error', new Error('offline'));
    expect(u.current).toEqual({ state: 'idle' });
    au.emit('update-available', { version: '0.3.0' });
    au.emit('error', new Error('reset'));
    expect(u.current).toEqual({ state: 'error', message: 'Не удалось скачать обновление' });
  });
});
