import { describe, expect, it } from 'vitest';
import { findHosts, publishHost } from './discovery';

describe('discovery (mDNS)', () => {
  it('findHosts всегда резолвится по таймауту', async () => {
    const hosts = await findHosts(200);
    expect(Array.isArray(hosts)).toBe(true);
  });

  // Мультикаст в CI-раннерах часто недоступен — там проверяем только API.
  it.skipIf(process.env.CI)('находит опубликованный хост', async () => {
    const name = `2dots-test-${process.pid}`;
    const unpublish = publishHost(name, 45_678);
    try {
      const hosts = await findHosts(2500);
      const me = hosts.find((h) => h.name === name);
      expect(me).toBeDefined();
      expect(me?.port).toBe(45_678);
      expect(me?.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    } finally {
      unpublish();
      unpublish();
    }
  });
});
