// Бот-игрок для тестов: pnpm bot --host 127.0.0.1 [--port 47777] [--game maze]
// Реализация — трек B в docs/PLAN.md.
import { parseArgs } from 'node:util';
import { DEFAULT_PORT } from '@2dots/core';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: String(DEFAULT_PORT) },
    game: { type: 'string', default: 'maze' },
  },
});

console.log(`bot: не реализован (host=${values.host}:${values.port}, game=${values.game})`);
