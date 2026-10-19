// Мок GameClient для разработки UI без сети (?mock=1 / TWODOTS_MODE=mock).
// Сценарий: лобби → соперник подключается → оба «готовы» → start → state (настоящая логика
// мини-игры из реестра + бродящий бот) → end → «Ещё раз» → лобби.
//
// Особые адреса для проверки экранов ошибок:
//   MOCK_UNREACHABLE_HOST — connect() реджектится («хост не отвечает»);
//   MOCK_FULL_HOST — сервер отвечает error 'full'.
// Тестовые хуки (dropConnection, opponentLeave) доступны через window.__twodotsMock.
import {
  DEFAULT_GAME_ID,
  getGame,
  MATCH_WINS,
  PLAYER_IDS,
  type AnyMiniGame,
  type LobbyPlayer,
  type PlayerId,
} from '@2dots/core';
import type { ClientStatus, GameClient, GameClientEvents } from '@2dots/net/client';

export const MOCK_UNREACHABLE_HOST = '192.0.2.1';
export const MOCK_FULL_HOST = '192.0.2.2';

export interface MockClientOptions {
  connectDelayMs: number;
  /** Через сколько после входа хоста подключится соперник. */
  joinDelayMs: number;
  /** Через сколько соперник нажмёт «Готов» после вас. */
  readyDelayMs: number;
  countdownMs: number;
  /** Длительность раунда, если мини-игра не закончилась сама. */
  roundMs: number;
}

const DEFAULTS: MockClientOptions = {
  connectDelayMs: 350,
  joinDelayMs: 1200,
  readyDelayMs: 600,
  countdownMs: 3000,
  roundMs: 4000,
};

const DIRS = ['up', 'down', 'left', 'right'] as const;

type Handler<K extends keyof GameClientEvents> = (payload: GameClientEvents[K]) => void;
type Match = Record<PlayerId, number>;

interface Round {
  game: AnyMiniGame;
  state: unknown;
  tick: number;
  elapsedMs: number;
}

export class MockGameClient implements GameClient {
  private _status: ClientStatus = 'idle';
  private _you: PlayerId | null = null;
  private readonly opts: MockClientOptions;
  private readonly handlers = new Map<keyof GameClientEvents, Set<(p: never) => void>>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private players: LobbyPlayer[] = [];
  private gameId = DEFAULT_GAME_ID;
  private config: unknown = getGame(DEFAULT_GAME_ID)?.defaultConfig();
  private match: Match = { p1: 0, p2: 0 };
  private matchOver = false;
  private round: Round | null = null;
  private countingDown = false;

  constructor(options: Partial<MockClientOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  get status(): ClientStatus {
    return this._status;
  }

  get you(): PlayerId | null {
    return this._you;
  }

  connect(host: string, _port: number, name: string): Promise<PlayerId> {
    if (this._status === 'connecting' || this._status === 'connected') {
      return Promise.reject(new Error('Уже подключено'));
    }
    this._status = 'connecting';
    return new Promise((resolve, reject) => {
      this.later(this.opts.connectDelayMs, () => {
        if (host === MOCK_UNREACHABLE_HOST) {
          this._status = 'closed';
          reject(new Error(`Хост ${host} не отвечает`));
          return;
        }
        if (host === MOCK_FULL_HOST) {
          this._status = 'closed';
          this.emit('error', { t: 'error', code: 'full', message: 'В игре уже двое' });
          reject(new Error('В игре уже двое'));
          return;
        }
        const isHost = host === '127.0.0.1' || host === 'localhost';
        const you: PlayerId = isHost ? 'p1' : 'p2';
        this._you = you;
        this._status = 'connected';
        this.players = isHost
          ? [player('p1', name)]
          : [player('p1', 'MacBook'), player('p2', name)];
        resolve(you);
        // lobby приходит сразу после welcome
        this.later(0, () => this.emitLobby());
        if (isHost) {
          this.later(this.opts.joinDelayMs, () => {
            this.players.push(player('p2', 'Соперник'));
            this.emitLobby();
          });
        }
      });
    });
  }

  setReady(ready: boolean): void {
    const me = this.me();
    if (!me || this.round || this.countingDown) return;
    me.ready = ready;
    this.emitLobby();
    const other = this.opponent();
    if (ready && other && !other.ready) {
      this.later(this.opts.readyDelayMs, () => {
        const opp = this.opponent();
        if (!opp || !this.me()?.ready) return;
        opp.ready = true;
        this.emitLobby();
        this.maybeStart();
      });
    } else {
      this.maybeStart();
    }
  }

  selectGame(gameId: string): void {
    if (this._you !== 'p1') {
      this.emit('error', { t: 'error', code: 'not_host', message: 'Игру выбирает хост' });
      return;
    }
    if (!getGame(gameId)) {
      this.emit('error', { t: 'error', code: 'unknown_game', message: `Нет игры ${gameId}` });
      return;
    }
    this.gameId = gameId;
    this.config = getGame(gameId)?.defaultConfig();
    for (const p of this.players) p.ready = false;
    this.emitLobby();
  }

  setConfig(config: unknown): void {
    if (this._you !== 'p1') {
      this.emit('error', { t: 'error', code: 'not_host', message: 'Настройки меняет хост' });
      return;
    }
    const next = getGame(this.gameId)?.parseConfig(config, this.config) ?? null;
    if (next === null) {
      this.emit('error', { t: 'error', code: 'bad_config', message: 'Некорректные настройки' });
      return;
    }
    this.config = next;
    for (const p of this.players) p.ready = false;
    this.emitLobby();
  }

  sendInput(input: unknown): void {
    const round = this.round;
    if (!round || !this._you) return;
    const parsed = round.game.parseInput(input);
    if (parsed !== null) round.game.applyInput(round.state, this._you, parsed);
  }

  rematch(): void {
    if (this.round || this.countingDown) return;
    if (this.matchOver) {
      this.match = { p1: 0, p2: 0 };
      this.matchOver = false;
    }
    // Как настоящий сервер: «Ещё раз» = сразу готов.
    this.setReady(true);
  }

  disconnect(): void {
    this.stopAll();
    this._status = 'closed';
  }

  on<K extends keyof GameClientEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (p: never) => void);
    return () => set.delete(handler as (p: never) => void);
  }

  // ---------- тестовые хуки ----------

  /** Имитирует обрыв соединения с хостом. */
  dropConnection(): void {
    this.stopAll();
    this._status = 'closed';
    this.emit('disconnect', { reason: 'Соединение с хостом потеряно' });
  }

  /** Соперник отключился: во время раунда — aborted, затем лобби без него. */
  opponentLeave(): void {
    const wasPlaying = this.round !== null || this.countingDown;
    this.stopRound();
    this.players = this.players.filter((p) => p.id === this._you);
    for (const p of this.players) p.ready = false;
    if (wasPlaying) this.emit('aborted', { t: 'aborted', reason: 'disconnect' });
    this.emitLobby();
  }

  // ---------- сценарий ----------

  private maybeStart(): void {
    if (this.players.length < 2 || !this.players.every((p) => p.ready)) return;
    const game = getGame(this.gameId);
    if (!game) return;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const config = this.config;
    this.countingDown = true;
    this.emit('start', {
      t: 'start',
      gameId: this.gameId,
      seed,
      config,
      countdownMs: this.opts.countdownMs,
    });
    this.later(this.opts.countdownMs, () => {
      this.countingDown = false;
      this.round = { game, state: game.init(seed, PLAYER_IDS, config), tick: 0, elapsedMs: 0 };
      this.runLoop();
    });
  }

  private runLoop(): void {
    const round = this.round;
    if (!round) return;
    const dt = 1000 / round.game.tickHz;
    const opponent: PlayerId = this._you === 'p1' ? 'p2' : 'p1';
    let botTimer = 0;
    this.loop = setInterval(() => {
      // бот соперника меняет направление примерно раз в 400 мс
      botTimer -= dt;
      if (botTimer <= 0) {
        botTimer = 400;
        const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
        const parsed = round.game.parseInput({ dir });
        if (parsed !== null) round.game.applyInput(round.state, opponent, parsed);
      }
      round.game.tick(round.state, dt);
      round.tick += 1;
      round.elapsedMs += dt;
      this.emit('state', { t: 'state', tick: round.tick, state: structuredClone(round.state) });
      const result = round.game.result(round.state);
      if (result !== null) this.finish(result);
      else if (round.elapsedMs >= this.opts.roundMs) this.finish(fakeResult(round));
    }, dt);
  }

  private finish(result: unknown): void {
    this.stopRound();
    const winner = winnerOf(result);
    if (winner) this.match[winner] += 1;
    const matchWinner = winner && this.match[winner] >= MATCH_WINS ? winner : null;
    this.matchOver = matchWinner !== null;
    for (const p of this.players) p.ready = false;
    this.emit('end', { t: 'end', result, match: { ...this.match }, matchWinner });
    this.emitLobby();
  }

  private stopRound(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.round = null;
    this.countingDown = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private stopAll(): void {
    this.stopRound();
  }

  private me(): LobbyPlayer | undefined {
    return this.players.find((p) => p.id === this._you);
  }

  private opponent(): LobbyPlayer | undefined {
    return this.players.find((p) => p.id !== this._you);
  }

  private emitLobby(): void {
    if (this._status !== 'connected') return;
    this.emit('lobby', {
      t: 'lobby',
      players: this.players.map((p) => ({ ...p })),
      gameId: this.gameId,
      config: this.config,
      match: { ...this.match },
    });
  }

  private emit<K extends keyof GameClientEvents>(event: K, payload: GameClientEvents[K]): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) (h as Handler<K>)(payload);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
}

function player(id: PlayerId, name: string): LobbyPlayer {
  return { id, name, ready: false, connected: true };
}

function winnerOf(result: unknown): PlayerId | null {
  if (typeof result !== 'object' || result === null) return null;
  const w = (result as { winner?: unknown }).winner;
  return w === 'p1' || w === 'p2' ? w : null;
}

/** Результат «как у лабиринта», если раунд не закончился сам (например, у заглушки логики). */
function fakeResult(round: Round): unknown {
  const s = round.state as { config?: { width?: number; height?: number } };
  const w = s.config?.width ?? 21;
  const hgt = s.config?.height ?? 15;
  const pathLength = w - 1 + (hgt - 1);
  // Уникальные клетки (режим distinct): каждый «исследовал» 10–40% лабиринта.
  const totalCells = w * hgt;
  const p1 = Math.round(totalCells * (0.1 + Math.random() * 0.3));
  const p2 = Math.round(totalCells * (0.1 + Math.random() * 0.3));
  const winner = p1 === p2 ? 'draw' : p1 > p2 ? 'p1' : 'p2';
  return {
    winner,
    reason: 'met',
    scores: { p1, p2 },
    meetCell: null,
    pathLength,
    scoring: 'distinct',
    totalCells,
  };
}
