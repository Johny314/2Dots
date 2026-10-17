// Мок window.api для ?mock=1: hostStart/discoverHosts в main-процессе пока не реализованы (трек C).
import { DEFAULT_PORT } from '@2dots/core';
import type { DesktopApi } from '../../../shared/api';
import { MOCK_FULL_HOST, MOCK_UNREACHABLE_HOST } from './mock-client';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMockApi(version: string): DesktopApi {
  return {
    async hostStart() {
      await wait(300);
      return { port: DEFAULT_PORT, ips: ['192.168.1.42'] };
    },
    async hostStop() {},
    async discoverHosts() {
      await wait(700);
      return [
        { name: 'MacBook', ip: '192.168.1.42', port: DEFAULT_PORT },
        { name: 'Недоступный хост', ip: MOCK_UNREACHABLE_HOST, port: DEFAULT_PORT },
        { name: 'Полная игра', ip: MOCK_FULL_HOST, port: DEFAULT_PORT },
      ];
    },
    getVersion: () => version,
  };
}
