// Мок window.api для ?mock=1: UI без настоящего сервера и mDNS.
import { DEFAULT_PORT } from '@2dots/core';
import type { DesktopApi } from '../../../shared/api';
import { MOCK_FULL_HOST, MOCK_UNREACHABLE_HOST } from './mock-client';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMockApi(version: string): DesktopApi {
  return {
    async hostStart(_name: string) {
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
    // ?mock=1&update=ready|available — показать баннер обновления без сети.
    onUpdate: (handler) => {
      const kind = new URLSearchParams(location.search).get('update');
      if (kind === 'ready') handler({ state: 'ready', version: '9.9.9' });
      else if (kind === 'available')
        handler({ state: 'available', version: '9.9.9', mode: 'manual' });
      else handler({ state: 'idle' });
      return () => undefined;
    },
    installUpdate: () => undefined,
    openReleasePage: () => undefined,
  };
}
