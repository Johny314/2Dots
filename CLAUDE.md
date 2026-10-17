# 2Dots

Сборник мини-игр для двоих по локальной сети. Electron + TypeScript, pnpm-монорепо.
Документы: `docs/GAME_DESIGN.md` (правила), `docs/ARCHITECTURE.md` (стек, контракты), `docs/PLAN.md` (фазы и треки агентов).

## Команды

- `pnpm i` — установка
- `pnpm dev` — запуск приложения; `pnpm dev:mock` — UI на моках (`?mock=1`), `pnpm dev:local` — лабиринт на одной клавиатуре (`?local=1`)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm test:e2e`
- `pnpm bot --host 127.0.0.1 [--port N] [--rounds N]` — бот-соперник
- `TWODOTS_PORT=N pnpm dev` — порт хоста (по умолчанию 47777, `0` — случайный): второй экземпляр на той же машине; гость вводит `127.0.0.1:N`
- `UPDATE_SCREENSHOTS=1 pnpm test:e2e` — перезаписать скриншоты в `apps/desktop/e2e/screenshots/` (по умолчанию пишутся в gitignored `test-results/`)
- `TWODOTS_E2E=1` — тестовые хуки renderer (`window.__twodots`, только для e2e)
- `pnpm dist:mac` / `pnpm dist:win` — сборка
- Electron скачивает бинарник при первом запуске; вручную: `node node_modules/electron/install.js`

## Правила

- `packages/core` — чистый TS: никаких DOM, Node API, `Date.now()`, `Math.random()`. Только `rng.ts` и фиксированный `dt`. Логика детерминирована.
- Контракты `core/src/minigame.ts`, `core/src/protocol.ts`, `core/src/games/*/types.ts` меняются только отдельной задачей.
- Все сетевые сообщения валидируются zod-схемами из `protocol.ts`.
- Сервер авторитарен; клиент шлёт только ввод.
- Новая мини-игра = реализация `MiniGame` + рендерер + регистрация в `registry.ts` + тесты.
- Не использовать `requestSingleInstanceLock` — для тестов нужны два экземпляра.
- Workspace-пакеты подключаются как исходники TS (`exports` → `src/*.ts`), без шага сборки; Electron бандлит их в `out/`.
- Импорт из `@2dots/core/testing` — только в тестах и `tools/`.
- Идентификаторы в коде — на английском; комментарии и тексты интерфейса — на русском.
