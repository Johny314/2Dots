import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    // Всё (включая workspace-пакеты на TS) бандлится в out/main — упакованному приложению не нужны node_modules.
    build: { externalizeDeps: false },
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
