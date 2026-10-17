import { GAMES } from '@2dots/core';
import './style.css';

// Режимы запуска (см. CLAUDE.md): ?mock=1 — UI на моках (трек D), ?local=1 — лабиринт локально (трек E).
const params = new URLSearchParams(location.search);
const mode = params.has('local') ? 'local' : params.has('mock') ? 'mock' : 'app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app не найден');

const games = Object.values(GAMES)
  .map((g) => g.title)
  .join(', ');

root.innerHTML = `
  <main class="splash">
    <div class="dots"><span class="dot p1"></span><span class="dot p2"></span></div>
    <h1>2Dots</h1>
    <p class="muted">Мини-игры: ${games}</p>
    <p class="muted" data-testid="mode">режим: ${mode} · версия ${window.api.getVersion()}</p>
  </main>
`;
