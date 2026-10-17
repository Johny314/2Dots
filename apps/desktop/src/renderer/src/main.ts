import { createGameClient } from '@2dots/net/client';
import { startLocalMode } from './games/local-entry';
import { installTestHooks } from './test-hooks';
import { startApp } from './ui/app';
import { createMockApi } from './ui/mock-api';
import { MockGameClient } from './ui/mock-client';
import './style.css';

// Режимы запуска (см. CLAUDE.md): ?mock=1 — UI на моках, ?local=1 — лабиринт локально,
// ?e2e=1 — тестовые хуки (window.__twodots) для e2e.
const params = new URLSearchParams(location.search);
const mode = params.has('local') ? 'local' : params.has('mock') ? 'mock' : 'app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app не найден');

function appVersion(): string {
  try {
    return window.api.getVersion();
  } catch {
    return 'dev';
  }
}

if (mode === 'local') {
  startLocalMode(root);
} else {
  const version = appVersion();
  const footer = `версия ${version} · режим: ${mode}`;
  if (mode === 'mock') {
    startApp(root, {
      api: createMockApi(version),
      createClient: () => {
        const client = new MockGameClient();
        // тестовые хуки для e2e (обрыв связи, уход соперника)
        (window as unknown as { __twodotsMock?: MockGameClient }).__twodotsMock = client;
        return client;
      },
      footer,
    });
  } else {
    const e2e = params.has('e2e');
    startApp(root, {
      api: window.api,
      createClient: () => (e2e ? installTestHooks(createGameClient()) : createGameClient()),
      footer,
    });
  }
}
