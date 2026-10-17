# 2Dots — архитектура и стек

## Выбор движка

**Решение: Electron + TypeScript + Canvas 2D (без игрового движка).**

| Вариант           | Плюсы                                                                                                                                                                  | Минусы                                                                                                         | Итог             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Electron + TS** | Агенты лучше всего пишут TS; чистая логика тестируется в vitest без UI; модули легко делить между параллельными агентами; WebSocket‑сервер прямо в процессе приложения | Сборка ~150 МБ; Windows‑сборку надёжнее делать в CI                                                            | ✅ выбран        |
| Godot 4           | Экспорт в Mac/Win в один клик, встроенный ENet, хорошее «ощущение» игры                                                                                                | Файлы сцен `.tscn` агенты правят плохо, конфликты слияния, слабее цикл «написал → протестировал» без редактора | запасной вариант |
| Tauri             | Маленький бинарник                                                                                                                                                     | Сервер пришлось бы писать на Rust, Windows‑сборка с Mac болезненна                                             | ❌               |
| Unity             | —                                                                                                                                                                      | Тяжёлый, плохо управляется агентами                                                                            | ❌               |

Почему без Phaser/PixiJS: для точек на сетке хватает Canvas 2D, меньше поверхность для ошибок. PixiJS можно подключить позже, если какой-то мини-игре понадобятся спрайты/частицы.

## Стек и пакеты

Версии фиксируются при скаффолдинге (Фаза 0) — берём актуальные стабильные и пишем их точно, без `^`.

| Назначение                  | Пакет                                                               |
| --------------------------- | ------------------------------------------------------------------- |
| Менеджер пакетов / монорепо | `pnpm` (workspaces) — установить: `npm i -g pnpm`                   |
| Язык                        | `typescript` (strict)                                               |
| Electron + сборка           | `electron`, `electron-vite`, `vite`                                 |
| Упаковка                    | `electron-builder` (mac: `dmg`, win: `nsis` + `portable`)           |
| Сеть                        | `ws` (сервер в main‑процессе), браузерный `WebSocket` в renderer    |
| Поиск хоста в сети          | `bonjour-service` (mDNS) — опционально, ручной ввод IP всегда есть  |
| Валидация сообщений         | `zod`                                                               |
| Тесты                       | `vitest` (логика, сеть), `@playwright/test` (e2e через `_electron`) |
| Качество                    | `eslint` + `typescript-eslint`, `prettier`                          |
| Звук (Фаза 3)               | Web Audio API напрямую, эффекты сгенерировать в jsfxr               |
| CI                          | GitHub Actions: матрица `macos-latest` + `windows-latest`           |

## Структура репозитория

```
2Dots/
├─ CLAUDE.md                     правила для агентов
├─ package.json                  корневые скрипты
├─ pnpm-workspace.yaml
├─ docs/                         GAME_DESIGN, ARCHITECTURE, PLAN
├─ packages/
│  ├─ core/                      ЧИСТЫЙ TS: без DOM, без Node API
│  │  └─ src/
│  │     ├─ minigame.ts          интерфейс MiniGame, PlayerId
│  │     ├─ protocol.ts          сообщения + zod‑схемы, PROTOCOL_VERSION
│  │     ├─ rng.ts               детерминированный ГПСЧ (mulberry32)
│  │     ├─ registry.ts          реестр мини-игр
│  │     └─ games/maze/          генерация, движение, встреча, счёт
│  └─ net/                       сеть (Node + браузер)
│     └─ src/
│        ├─ host-server.ts       ws‑сервер: лобби + игровой цикл (любой MiniGame)
│        ├─ client.ts            GameClient для renderer (браузерный WebSocket)
│        └─ discovery.ts         mDNS публикация/поиск
├─ apps/desktop/                 Electron
│  └─ src/
│     ├─ main/                   окно, запуск/остановка хоста, IPC
│     ├─ preload/                безопасный мост window.api
│     └─ renderer/
│        └─ src/ui/              меню, лобби, результаты (DOM + CSS)
│           src/games/maze/      Canvas‑рендерер, ввод, туман войны
├─ tools/bot.ts                  бот‑игрок (BFS) для тестов в одиночку
└─ .github/workflows/release.yml сборка mac + win
```

## Сетевая модель

- **Хост‑авторитарная.** Один ноутбук нажимает «Создать игру» — в его main‑процессе стартует ws‑сервер на `0.0.0.0:47777`. Его же renderer подключается к `ws://127.0.0.1:47777` как обычный клиент. Второй ноутбук — «Присоединиться» (найден по mDNS или введён IP).
- Клиенты шлют **только ввод**, сервер тикает **30 Гц** с фиксированным `dt`, после каждого тика рассылает состояние.
- Лабиринт генерируется из `seed` детерминированно (это даёт воспроизводимые тесты), но для простоты сервер рассылает state целиком, вместе с лабиринтом.
- Без client‑side prediction: в LAN задержка единицы мс. Renderer лишь плавно анимирует точку между двумя последними состояниями (визуальный lerp).
- Античит не нужен — играют двое своих. Туман войны рисуется на клиенте.
- Порядок по умолчанию: хостит Mac (меньше проблем с файрволом), Windows-ноутбук присоединяется. Хост на Windows тоже должен работать (после разрешения в файрволе).

## Контракты (зафиксированы в Фазе 0)

Источник истины — код, а не этот документ. Меняются только отдельной задачей.

| Файл                                                 | Что внутри                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/minigame.ts`                      | `PlayerId` (`p1` — хост, `p2` — гость), интерфейс `MiniGame<Config, State, Input, Result>`: `defaultConfig`, `init(seed, players, config)`, `parseInput(raw)` (валидация ввода из сети), `applyInput`, `tick(state, dtMs)` (мутируют state), `result(state)` |
| `packages/core/src/protocol.ts`                      | zod-схемы `ClientMsg` (`hello`, `ready`, `select`, `input`, `rematch`) и `ServerMsg` (`welcome`, `lobby`, `start`, `state`, `end`, `error`), `parseClientMsg/parseServerMsg`, `PROTOCOL_VERSION`, `DEFAULT_PORT = 47777`, `MATCH_WINS = 3`                   |
| `packages/core/src/games/maze/types.ts`              | `Dir`, `WALL` (битмаска up=1 right=2 down=4 left=8), `MazeConfig`, `MazeInput`, `Maze`, `MazePlayer`, `MazeState`, `MazeResult`                                                                                                                              |
| `packages/core/src/registry.ts`                      | `GAMES`, `getGame(id)`, `DEFAULT_GAME_ID`                                                                                                                                                                                                                    |
| `packages/core/src/rng.ts`                           | `Rng` (mulberry32): `next`, `int`, `pick`, `shuffle`                                                                                                                                                                                                         |
| `packages/core/src/testing/fake-game.ts`             | `counterGame` — мини-игра для тестов сети                                                                                                                                                                                                                    |
| `apps/desktop/src/shared/api.ts`                     | `DesktopApi` (мост `window.api`) и имена IPC-каналов                                                                                                                                                                                                         |
| `packages/net/src/index.ts`                          | `startHostServer(options) → HostServerHandle`, `publishHost(name, port)`, `findHosts(timeoutMs)`                                                                                                                                                             |
| `apps/desktop/src/renderer/src/games/local-entry.ts` | `startLocalMode(root)` — режим `?local=1` (владелец — трек E, вызывает `main.ts`)                                                                                                                                                                            |
| `packages/net/src/client.ts`                         | интерфейс `GameClient`: подключение, ready/select/input/rematch, события `lobby/start/state/end/aborted/error/disconnect`                                                                                                                                    |
| `apps/desktop/src/renderer/src/games/types.ts`       | `MountGameView` — контракт рендерера мини-игры; реестр `GAME_VIEWS` в `games/index.ts`                                                                                                                                                                       |

Ключевые решения:

- `MazeState` содержит `seed`, `config` и сгенерированный `maze` — сервер рассылает state **целиком** каждый тик (~2–3 КБ × 30 Гц, для LAN пустяк). Это проще, чем собирать статику и динамику отдельно.
- `MazeState.result` заполняется внутри `tick`; `result(state)` его просто возвращает.
- Пакеты `@2dots/core` и `@2dots/net` экспортируют исходники TS; `@2dots/net/client` — только браузерная часть (без Node API).

## IPC (preload → `window.api`)

```ts
hostStart(): Promise<{ port: number; ips: string[] }>
hostStop(): Promise<void>
discoverHosts(): Promise<{ name: string; ip: string; port: number }[]>
getVersion(): string
```

## Платформенные особенности (обязательно в README)

- **macOS:** приложение не подписано → первый запуск через «правый клик → Открыть» или `xattr -cr /Applications/2Dots.app`. macOS спросит разрешение «Локальная сеть» и «Входящие подключения» — нажать «Разрешить».
- **Windows:** SmartScreen → «Подробнее → Выполнить в любом случае». Файрвол при первом запуске хоста → разрешить для **частных** сетей.
- Wi‑Fi сеть в Windows должна быть «Частная», не «Общественная».
- Гостевые Wi‑Fi и некоторые роутеры изолируют клиентов — тогда соединения не будет; запасной вариант: раздать хотспот с телефона.
- Целевые устройства: Mac пользователя — Apple Silicon (arm64) → `dmg` arm64; ноутбук девушки — Windows (Honor, x64) → `nsis` + `portable` x64. Universal-сборка для Mac не нужна. Если ноутбук окажется на ARM (Snapdragon), x64-сборка работает через эмуляцию.
