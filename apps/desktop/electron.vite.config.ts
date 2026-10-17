import { readFileSync } from 'node:fs';
import { defineConfig } from 'electron-vite';

// Версия приложения из package.json: app.getVersion() в dev/e2e отдаёт версию Electron.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  main: {
    // Всё (включая workspace-пакеты на TS, ws и bonjour-service) бандлится в out/main —
    // упакованному приложению не нужны node_modules (electron-builder.yml их и не кладёт).
    build: { externalizeDeps: false },
    // У ws есть опциональные нативные ускорители bufferutil/utf-8-validate. Они не установлены,
    // и vite подставляет вместо них заглушку, бросающую ошибку внутри try/catch ws. Флаги ниже
    // выключают сами попытки require — код этих веток выкидывается из бандла.
    define: {
      __APP_VERSION__: JSON.stringify(version),
      'process.env.WS_NO_BUFFER_UTIL': JSON.stringify('1'),
      'process.env.WS_NO_UTF_8_VALIDATE': JSON.stringify('1'),
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      // sandbox: true требует CommonJS-preload.
      rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {},
});
