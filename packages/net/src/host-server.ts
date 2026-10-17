// Хост-сервер: лобби, отсчёт и игровой цикл для любой мини-игры из реестра.
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  DEFAULT_GAME_ID,
  DEFAULT_PORT,
  GAMES,
  MATCH_WINS,
  PLAYER_IDS,
  PROTOCOL_VERSION,
  parseClientMsg,
  type AnyMiniGame,
  type ClientMsg,
  type ErrorCode,
  type LobbyPlayer,
  type PlayerId,
  type ServerMsg,
} from '@2dots/core';

export interface HostServerOptions {
  /** По умолчанию DEFAULT_PORT. 0 — случайный свободный порт (для тестов). */
  port?: number;
  /** По умолчанию GAMES из реестра core. */
  games?: Readonly<Record<string, AnyMiniGame>>;
  /** Длительность отсчёта перед раундом, по умолчанию 3000 (в тестах можно 0). */
  countdownMs?: number;
}

export interface HostServerHandle {
  /** Фактический порт (важно при port: 0). */
  readonly port: number;
  stop(): Promise<void>;
}

const DEFAULT_COUNTDOWN_MS = 3000;
/** Сколько пропущенных тиков догоняем за раз (если цикл событий подвис). */
const MAX_CATCH_UP_TICKS = 5;

type Phase = 'lobby' | 'countdown' | 'playing' | 'results';

interface Slot {
  socket: WebSocket;
  name: string;
  ready: boolean;
  lastSeq: number;
  /** Последний ввод, пришедший во время отсчёта; применяется в момент старта. */
  pendingInput: unknown;
  hasPendingInput: boolean;
}

interface Round {
  game: AnyMiniGame;
  state: unknown;
  dtMs: number;
  nextTickAt: number;
  tick: number;
  timer: ReturnType<typeof setTimeout> | null;
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}

function emptyMatch(): Record<PlayerId, number> {
  return { p1: 0, p2: 0 };
}

/** Победитель раунда, если результат игры содержит поле winner = p1/p2. Ничья — null. */
function roundWinner(result: unknown): PlayerId | null {
  if (typeof result !== 'object' || result === null) return null;
  const winner = (result as { winner?: unknown }).winner;
  return PLAYER_IDS.includes(winner as PlayerId) ? (winner as PlayerId) : null;
}

class HostServer {
  private readonly slots: Record<PlayerId, Slot | null> = { p1: null, p2: null };
  private readonly games: Readonly<Record<string, AnyMiniGame>>;
  private readonly countdownMs: number;
  private gameId: string;
  private phase: Phase = 'lobby';
  private match = emptyMatch();
  private matchOver = false;
  private round: Round | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly wss: WebSocketServer,
    options: HostServerOptions,
  ) {
    this.games = options.games ?? GAMES;
    this.countdownMs = options.countdownMs ?? DEFAULT_COUNTDOWN_MS;
    const ids = Object.keys(this.games);
    const first = ids[0];
    if (first === undefined) throw new Error('Список мини-игр пуст');
    this.gameId = ids.includes(DEFAULT_GAME_ID) ? DEFAULT_GAME_ID : first;
    wss.on('connection', (socket) => this.onConnection(socket));
  }

  get port(): number {
    return (this.wss.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    this.clearTimers();
    this.round = null;
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  // ---------- соединения ----------

  private onConnection(socket: WebSocket): void {
    let player: PlayerId | null = null;

    socket.on('message', (data: RawData, isBinary: boolean) => {
      const msg = isBinary ? null : parseClientMsg(rawToString(data));
      if (!msg) {
        this.sendError(socket, 'bad_msg', 'Некорректное сообщение');
        return;
      }
      if (player === null) {
        if (msg.t !== 'hello') {
          this.sendError(socket, 'bad_msg', 'Сначала нужно отправить hello');
          return;
        }
        player = this.onHello(socket, msg);
        return;
      }
      this.onMessage(player, msg);
    });

    socket.on('close', () => {
      if (player !== null && this.slots[player]?.socket === socket) this.onLeave(player);
    });
    socket.on('error', () => socket.terminate());
  }

  private onHello(socket: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>): PlayerId | null {
    if (msg.v !== PROTOCOL_VERSION) {
      this.sendError(
        socket,
        'version',
        `Несовместимая версия протокола: у хоста ${PROTOCOL_VERSION}, у клиента ${msg.v}`,
      );
      socket.close();
      return null;
    }
    const id = PLAYER_IDS.find((p) => this.slots[p] === null);
    if (id === undefined || this.phase === 'countdown' || this.phase === 'playing') {
      this.sendError(socket, 'full', 'В игре уже два игрока');
      socket.close();
      return null;
    }
    this.slots[id] = {
      socket,
      name: msg.name,
      ready: false,
      lastSeq: -1,
      pendingInput: null,
      hasPendingInput: false,
    };
    // Новый соперник — новый матч.
    this.resetMatch();
    this.send(socket, { t: 'welcome', v: PROTOCOL_VERSION, you: id });
    this.broadcastLobby();
    return id;
  }

  private onLeave(player: PlayerId): void {
    this.slots[player] = null;
    if (this.phase === 'countdown' || this.phase === 'playing') {
      this.clearTimers();
      this.round = null;
      this.broadcast({ t: 'aborted', reason: 'disconnect' });
    }
    this.phase = 'lobby';
    this.resetReady();
    this.resetMatch();
    this.broadcastLobby();
  }

  // ---------- сообщения ----------

  private onMessage(player: PlayerId, msg: ClientMsg): void {
    const slot = this.slots[player];
    if (!slot) return;
    switch (msg.t) {
      case 'hello':
        this.sendError(slot.socket, 'bad_msg', 'hello уже получен');
        return;
      case 'ready':
        this.setReady(player, msg.ready);
        return;
      case 'rematch':
        this.setReady(player, true);
        return;
      case 'select':
        this.onSelect(player, msg.gameId);
        return;
      case 'input':
        this.onInput(player, msg.seq, msg.input);
        return;
    }
  }

  private setReady(player: PlayerId, ready: boolean): void {
    const slot = this.slots[player];
    if (!slot || (this.phase !== 'lobby' && this.phase !== 'results')) return;
    if (slot.ready === ready) return;
    slot.ready = ready;
    this.broadcastLobby();
    if (PLAYER_IDS.every((p) => this.slots[p]?.ready)) this.startRound();
  }

  private onSelect(player: PlayerId, gameId: string): void {
    const slot = this.slots[player];
    if (!slot) return;
    if (player !== 'p1') {
      this.sendError(slot.socket, 'not_host', 'Выбирать мини-игру может только хост');
      return;
    }
    if (!Object.hasOwn(this.games, gameId)) {
      this.sendError(slot.socket, 'unknown_game', `Неизвестная мини-игра: ${gameId}`);
      return;
    }
    if (this.phase !== 'lobby' && this.phase !== 'results') return;
    if (gameId === this.gameId) return;
    this.gameId = gameId;
    this.phase = 'lobby';
    this.resetReady();
    this.resetMatch();
    this.broadcastLobby();
  }

  private onInput(player: PlayerId, seq: number, raw: unknown): void {
    const slot = this.slots[player];
    const round = this.round;
    if (!slot || !round) return;
    if (seq <= slot.lastSeq) return;
    const input = round.game.parseInput(raw);
    if (input === null) {
      this.sendError(slot.socket, 'bad_msg', 'Некорректный ввод');
      return;
    }
    slot.lastSeq = seq;
    if (this.phase === 'countdown') {
      slot.pendingInput = input;
      slot.hasPendingInput = true;
    } else if (this.phase === 'playing') {
      round.game.applyInput(round.state, player, input);
    }
  }

  // ---------- раунд ----------

  private startRound(): void {
    const game = this.games[this.gameId];
    if (!game) return;
    if (this.matchOver) this.resetMatch();
    for (const p of PLAYER_IDS) {
      const slot = this.slots[p];
      if (!slot) return;
      slot.ready = false;
      slot.lastSeq = -1;
      slot.pendingInput = null;
      slot.hasPendingInput = false;
    }
    const seed = randomSeed();
    const config = game.defaultConfig();
    const state = game.init(seed, PLAYER_IDS, config);
    this.round = { game, state, dtMs: 1000 / game.tickHz, nextTickAt: 0, tick: 0, timer: null };
    this.phase = 'countdown';
    this.broadcast({
      t: 'start',
      gameId: this.gameId,
      seed,
      config,
      countdownMs: this.countdownMs,
    });
    // Начальное состояние — чтобы рендерер мог нарисовать поле во время отсчёта.
    this.broadcast({ t: 'state', tick: 0, state });
    this.countdownTimer = setTimeout(() => this.beginPlaying(), this.countdownMs);
  }

  private beginPlaying(): void {
    this.countdownTimer = null;
    const round = this.round;
    if (!round) return;
    this.phase = 'playing';
    for (const p of PLAYER_IDS) {
      const slot = this.slots[p];
      if (slot?.hasPendingInput) {
        round.game.applyInput(round.state, p, slot.pendingInput);
        slot.hasPendingInput = false;
        slot.pendingInput = null;
      }
    }
    round.nextTickAt = performance.now() + round.dtMs;
    this.scheduleTick(round);
  }

  private scheduleTick(round: Round): void {
    const delay = Math.max(0, round.nextTickAt - performance.now());
    round.timer = setTimeout(() => this.runTicks(round), delay);
  }

  /** Фиксированный dt; расписание по абсолютному времени компенсирует дрейф таймеров. */
  private runTicks(round: Round): void {
    round.timer = null;
    if (this.round !== round) return;
    let ticks = 0;
    let tickNo = 0;
    while (performance.now() >= round.nextTickAt && ticks < MAX_CATCH_UP_TICKS) {
      round.game.tick(round.state, round.dtMs);
      round.nextTickAt += round.dtMs;
      ticks++;
      tickNo = ++round.tick;
      const result = round.game.result(round.state);
      if (result !== null) {
        this.broadcast({ t: 'state', tick: tickNo, state: round.state });
        this.endRound(result);
        return;
      }
    }
    // Сильно отстали — не пытаемся догнать всё, сдвигаем расписание.
    if (performance.now() >= round.nextTickAt) round.nextTickAt = performance.now() + round.dtMs;
    if (ticks > 0) this.broadcast({ t: 'state', tick: tickNo, state: round.state });
    this.scheduleTick(round);
  }

  private endRound(result: unknown): void {
    this.round = null;
    this.phase = 'results';
    const winner = roundWinner(result);
    let matchWinner: PlayerId | null = null;
    if (winner !== null) {
      this.match[winner]++;
      if (this.match[winner] >= MATCH_WINS) matchWinner = winner;
    }
    this.matchOver = matchWinner !== null;
    this.broadcast({ t: 'end', result, match: { ...this.match }, matchWinner });
  }

  // ---------- вспомогательное ----------

  private resetReady(): void {
    for (const p of PLAYER_IDS) {
      const slot = this.slots[p];
      if (slot) slot.ready = false;
    }
  }

  private resetMatch(): void {
    this.match = emptyMatch();
    this.matchOver = false;
  }

  private clearTimers(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
    if (this.round?.timer) clearTimeout(this.round.timer);
  }

  private lobbyPlayers(): LobbyPlayer[] {
    const players: LobbyPlayer[] = [];
    for (const id of PLAYER_IDS) {
      const slot = this.slots[id];
      if (slot) players.push({ id, name: slot.name, ready: slot.ready, connected: true });
    }
    return players;
  }

  private broadcastLobby(): void {
    this.broadcast({
      t: 'lobby',
      players: this.lobbyPlayers(),
      gameId: this.gameId,
      match: { ...this.match },
    });
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const p of PLAYER_IDS) {
      const socket = this.slots[p]?.socket;
      if (socket && socket.readyState === socket.OPEN) socket.send(data);
    }
  }

  private send(socket: WebSocket, msg: ServerMsg): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  }

  private sendError(socket: WebSocket, code: ErrorCode, message: string): void {
    this.send(socket, { t: 'error', code, message });
  }
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

/** Поднимает ws-сервер на 0.0.0.0 и игровой цикл. */
export function startHostServer(options: HostServerOptions = {}): Promise<HostServerHandle> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      host: '0.0.0.0',
      port: options.port ?? DEFAULT_PORT,
      maxPayload: 64 * 1024,
    });
    const onError = (err: Error) => {
      wss.close();
      reject(err);
    };
    wss.once('error', onError);
    wss.once('listening', () => {
      wss.off('error', onError);
      // Ошибки после старта (например, у отдельных сокетов) не должны ронять процесс.
      wss.on('error', () => {});
      let server: HostServer;
      try {
        server = new HostServer(wss, options);
      } catch (err) {
        wss.close();
        reject(err as Error);
        return;
      }
      const port = server.port;
      resolve({ port, stop: () => server.stop() });
    });
  });
}
