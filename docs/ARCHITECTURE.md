# 2Dots — архитектура и стек

## Выбор движка

**Решение: Electron + TypeScript + Canvas 2D (без игрового движка).**

| Вариант | Плюсы | Минусы | Итог |
|---|---|---|---|
| **Electron + TS** | Агенты лучше всего пишут TS; чистая логика тестируется в vitest без UI; модули легко делить между параллельными агентами; WebSocket‑сервер прямо в процессе приложения | Сборка ~150 МБ; Windows‑сборку надёжнее делать в CI | ✅ выбран |
| Godot 4 | Экспорт в Mac/Win в один клик, встроенный ENet, хорошее «ощущение» игры | Файлы сцен `.tscn` агенты правят плохо, конфликты слияния, слабее цикл «написал → протестировал» без редактора | запасной вариант |
| Tauri | Маленький бинарник | Сервер пришлось бы писать на Rust, Windows‑сборка с Mac болезненна | ❌ |
| Unity | — | Тяжёлый, плохо управляется агентами | ❌ |

Почему без Phaser/PixiJS: для точек на сетке хватает Canvas 2D, меньше поверхность для ошибок. PixiJS можно подключить позже, если какой-то мини-игре понадобятся спрайты/частицы.

## Стек и пакеты

Версии фиксируются при скаффолдинге (Фаза 0) — берём актуальные стабильные и пишем их точно, без `^`.

| Назначение | Пакет |
|---|---|
| Менеджер пакетов / монорепо | `pnpm` (workspaces) — установить: `npm i -g pnpm` |
| Язык | `typescript` (strict) |
| Electron + сборка | `electron`, `electron-vite`, `vite` |
| Упаковка | `electron-builder` (mac: `dmg`, win: `nsis` + `portable`) |
| Сеть | `ws` (сервер в main‑процессе), браузерный `WebSocket` в renderer |
| Поиск хоста в сети | `bonjour-service` (mDNS) — опционально, ручной ввод IP всегда есть |
| Валидация сообщений | `zod` |
| Тесты | `vitest` (логика, сеть), `@playwright/test` (e2e через `_electron`) |
| Качество | `eslint` + `typescript-eslint`, `prettier` |
| Звук (Фаза 3) | Web Audio API напрямую, эффекты сгенерировать в jsfxr |
| CI | GitHub Actions: матрица `macos-latest` + `windows-latest` |

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
│        ├─ game-client.ts       клиент для renderer (браузерный WebSocket)
│        └─ discovery.ts         mDNS публикация/поиск
├─ apps/desktop/                 Electron
│  └─ src/
│     ├─ main/                   окно, запуск/остановка хоста, IPC
│     ├─ preload/                безопасный мост window.api
│     └─ renderer/
│        ├─ ui/                  меню, лобби, результаты (DOM + CSS)
│        └─ games/maze/          Canvas‑рендерер, ввод, туман войны
├─ tools/bot.ts                  бот‑игрок (BFS) для тестов в одиночку
└─ .github/workflows/release.yml сборка mac + win
```

## Сетевая модель

- **Хост‑авторитарная.** Один ноутбук нажимает «Создать игру» — в его main‑процессе стартует ws‑сервер на `0.0.0.0:47777`. Его же renderer подключается к `ws://127.0.0.1:47777` как обычный клиент. Второй ноутбук — «Присоединиться» (найден по mDNS или введён IP).
- Клиенты шлют **только ввод**, сервер тикает **30 Гц** с фиксированным `dt`, после каждого тика рассылает состояние.
- **Лабиринт по сети не передаётся** — передаётся `seed`, обе стороны генерируют одинаково. По сети идёт только динамическое состояние (позиции, посещённые клетки, таймер).
- Без client‑side prediction: в LAN задержка единицы мс. Renderer лишь плавно анимирует точку между двумя последними состояниями (визуальный lerp).
- Античит не нужен — играют двое своих. Туман войны рисуется на клиенте.
- Порядок по умолчанию: хостит Mac (меньше проблем с файрволом).

## Контракты (пишутся в Фазе 0, дальше меняются только через отдельную задачу)

```ts
// packages/core/src/minigame.ts
export type PlayerId = 'p1' | 'p2';

export interface MiniGame<Config, State, Input, Result> {
  readonly id: string;               // 'maze'
  readonly title: string;            // 'Лабиринт'
  readonly tickHz: number;           // 30
  defaultConfig(): Config;
  init(seed: number, players: readonly PlayerId[], config: Config): State;
  applyInput(state: State, player: PlayerId, input: Input): void; // мутирует state
  tick(state: State, dtMs: number): void;                         // детерминированно
  result(state: State): Result | null;   // null — игра идёт
  // State и Result обязаны быть JSON‑сериализуемыми
}
```

```ts
// packages/core/src/protocol.ts  (каждое сообщение — zod‑схема, тип через z.infer)
export const PROTOCOL_VERSION = 1;

type ClientMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'select'; gameId: string }                 // только хост
  | { t: 'input'; seq: number; input: unknown }     // валидирует сама мини-игра
  | { t: 'rematch' };

type ServerMsg =
  | { t: 'welcome'; v: number; you: PlayerId }
  | { t: 'lobby'; players: { id: PlayerId; name: string; ready: boolean }[]; gameId: string }
  | { t: 'start'; gameId: string; seed: number; config: unknown; countdownMs: number }
  | { t: 'state'; tick: number; state: unknown }
  | { t: 'end'; result: unknown; match: Record<PlayerId, number> }
  | { t: 'error'; code: 'version' | 'full' | 'bad_msg'; message: string };
```

```ts
// packages/core/src/games/maze/types.ts
export type Dir = 'up' | 'down' | 'left' | 'right';
export interface MazeConfig { width: number; height: number; speedCellsPerSec: number;
  fogRadius: number | null; timeLimitMs: number; scoring: 'bfs' | 'distinct' | 'steps' }
export interface MazeInput { dir: Dir | null }          // текущее удерживаемое направление
export interface Maze { width: number; height: number; walls: number[] } // битмаска N=1 E=2 S=4 W=8
export interface MazePlayer { x: number; y: number; dir: Dir | null; queued: Dir | null;
  moveProgress: number; visited: number[]; steps: number }
export interface MazeState { tick: number; elapsedMs: number; players: Record<PlayerId, MazePlayer> }
// Maze не входит в MazeState: generateMaze(seed, w, h) вызывается на каждой стороне.
export interface MazeResult { winner: PlayerId | 'draw'; reason: 'met' | 'timeout';
  scores: Record<PlayerId, number>; meetCell: [number, number] | null; pathLength: number }
```

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
- Mac пользователя — Apple Silicon (arm64). Архитектуру ноутбука девушки уточнить: Intel Mac → собрать `universal`; Windows на ARM → x64‑сборка работает через эмуляцию.
