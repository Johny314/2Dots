# 2Dots

Сборник мини-игр для двоих по локальной сети. Electron + TypeScript, pnpm-монорепо.
Документы: `docs/GAME_DESIGN.md` (правила), `docs/ARCHITECTURE.md` (стек, контракты), `docs/PLAN.md` (фазы и треки агентов).

## Команды
- `pnpm i` — установка
- `pnpm dev` — запуск приложения (`?mock=1` — UI на моках, `?local=1` — лабиринт на одной клавиатуре)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm test:e2e`
- `pnpm bot --host 127.0.0.1` — бот-соперник
- `pnpm dist:mac` / `pnpm dist:win` — сборка

## Правила
- `packages/core` — чистый TS: никаких DOM, Node API, `Date.now()`, `Math.random()`. Только `rng.ts` и фиксированный `dt`. Логика детерминирована.
- Контракты `core/src/minigame.ts`, `core/src/protocol.ts`, `core/src/games/*/types.ts` меняются только отдельной задачей.
- Все сетевые сообщения валидируются zod-схемами из `protocol.ts`.
- Сервер авторитарен; клиент шлёт только ввод.
- Новая мини-игра = реализация `MiniGame` + рендерер + регистрация в `registry.ts` + тесты.
- Не использовать `requestSingleInstanceLock` — для тестов нужны два экземпляра.
- Идентификаторы в коде — на английском; комментарии и тексты интерфейса — на русском.
