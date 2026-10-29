// Контроллер экранов: связывает window.api (хост/поиск), GameClient и экраны.
import {
  DEFAULT_GAME_ID,
  getGame,
  type ErrorCode,
  type LobbyPlayer,
  type PlayerId,
  type ServerMsg,
} from '@2dots/core';
import { basicSummary } from '../games/types';
import { getGameModule } from '../games';
import type { GameClient } from '@2dots/net/client';
import type { DesktopApi, HostInfo } from '../../../shared/api';
import { errorMessage } from './dom';
import { Router } from './router';
import { mountUpdateBanner } from './update-banner';
import {
  loadLastGame,
  loadName,
  loadSettings,
  saveLastGame,
  saveName,
  saveSettings,
} from './storage';
import { namesFrom } from './screens/common';
import { errorScreen } from './screens/error';
import { gameScreen, type GameScreen } from './screens/game';
import { homeScreen } from './screens/home';
import { hostWaitScreen, type HostWaitScreen } from './screens/host-wait';
import { joinScreen, type JoinScreen } from './screens/join';
import { lobbyScreen, type LobbyScreen } from './screens/lobby';
import { resultScreen, type ResultScreen } from './screens/result';

type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>;

export interface AppDeps {
  api: DesktopApi;
  /** Может бросить (например, реальный клиент ещё не реализован) — покажем ошибку. */
  createClient(): GameClient;
  /** Строка в подвале главного экрана (режим, версия). */
  footer: string;
}

interface Session {
  client: GameClient;
  hosting: boolean;
  you: PlayerId | null;
  lobby: LobbyMsg | null;
  /** Игра текущего (последнего) раунда — из start. */
  gameId: string | null;
  /** Мы сами вышли из раунда в лобби — aborted от сервера ожидаем, сообщение не нужно. */
  leftRound: boolean;
  closed: boolean;
  offs: (() => void)[];
}

function withReady(lobby: LobbyMsg, ready: (p: LobbyPlayer) => boolean): LobbyMsg {
  return { ...lobby, players: lobby.players.map((p) => ({ ...p, ready: ready(p) })) };
}

const OPPONENT_LEFT = 'Соперник отключился';

function hasOpponent(lobby: LobbyMsg | null, you: PlayerId | null): boolean {
  return !!lobby?.players.some((p) => p.id !== you && p.connected);
}

const NETWORK_HINT =
  'Проверьте, что оба компьютера в одной сети (Wi‑Fi или кабель к тому же роутеру), и попробуйте снова.';

const SOFT_ERRORS: Partial<Record<ErrorCode, string>> = {
  not_host: 'Игру и настройки выбирает хост',
  bad_config: 'Хост не принял настройки — возможно, разные версии приложения',
  unknown_game: 'Такой мини-игры нет у хоста — обновите приложение',
  bad_msg: 'Хост не понял сообщение — возможно, разные версии приложения',
};

export function startApp(root: HTMLElement, deps: AppDeps): void {
  const router = new Router(root);
  mountUpdateBanner(deps.api, router);
  let name = loadName();
  let session: Session | null = null;
  let busy = false;

  // Активные экраны, которые обновляются на месте.
  const refs: {
    hostWait: HostWaitScreen | null;
    lobby: LobbyScreen | null;
    game: GameScreen | null;
    result: ResultScreen | null;
  } = { hostWait: null, lobby: null, game: null, result: null };

  function clearRefs(): void {
    refs.hostWait = refs.lobby = refs.game = refs.result = null;
  }

  function endSession(): void {
    const s = session;
    if (!s) return;
    session = null;
    s.closed = true;
    for (const off of s.offs) off();
    try {
      s.client.disconnect();
    } catch {
      // уже закрыт
    }
    if (s.hosting) deps.api.hostStop().catch(() => undefined);
  }

  function goHome(): void {
    endSession();
    clearRefs();
    router.show(
      homeScreen({
        name,
        footer: deps.footer,
        onNameChange: (n) => {
          name = n;
          saveName(n);
        },
        onCreate: (n) => void createGame(n),
        onJoin: (n) => {
          name = n;
          saveName(n);
          showJoin();
        },
      }),
    );
  }

  function fail(title: string, message: string, hint?: string): void {
    endSession();
    clearRefs();
    router.show(errorScreen({ title, message, hint, onHome: goHome }));
  }

  function newClient(): GameClient | null {
    try {
      return deps.createClient();
    } catch (err) {
      fail(
        'Сетевой клиент недоступен',
        errorMessage(err),
        'Эта часть приложения ещё в разработке.',
      );
      return null;
    }
  }

  function openSession(client: GameClient, hosting: boolean): Session {
    const s: Session = {
      client,
      hosting,
      you: null,
      lobby: null,
      gameId: null,
      leftRound: false,
      closed: false,
      offs: [],
    };
    session = s;
    const live = () => session === s && !s.closed;

    s.offs.push(
      client.on('lobby', (msg) => {
        if (!live()) return;
        const prev = s.lobby;
        s.lobby = msg;
        onLobby(s, prev);
      }),
      client.on('start', (msg) => {
        if (!live() || !s.you) return;
        // Сервер шлёт lobby со сброшенной готовностью перед start; на всякий случай сбрасываем и тут.
        if (s.lobby) s.lobby = withReady(s.lobby, () => false);
        s.gameId = msg.gameId;
        showGame(s, msg);
      }),
      client.on('state', (msg) => {
        if (live()) refs.game?.update(msg.state);
      }),
      client.on('end', (msg) => {
        if (!live() || !s.you) return;
        // Сначала доигрываем анимацию встречи на экране игры, потом — результат.
        const game = refs.game;
        const wait = game?.outroMs() ?? 0;
        if (wait <= 0) {
          showResult(s, msg);
          return;
        }
        setTimeout(() => {
          if (live() && refs.game === game) showResult(s, msg);
        }, wait);
      }),
      client.on('aborted', (msg) => {
        if (!live()) return;
        if (msg.reason === 'left' && s.leftRound) {
          s.leftRound = false;
          return;
        }
        showLobby(
          s,
          msg.reason === 'left'
            ? 'Соперник вышел в лобби — раунд не засчитан'
            : `${OPPONENT_LEFT} — раунд не засчитан`,
        );
      }),
      client.on('error', (msg) => {
        if (!live()) return;
        if (msg.code === 'version') {
          fail(
            'Разные версии игры',
            msg.message,
            'Обновите 2Dots на обоих компьютерах до одной версии: о новой версии игра сообщает на главном экране.',
          );
        } else if (msg.code === 'full') {
          fail(
            'Игра уже занята',
            'В этой игре уже двое игроков.',
            'Попросите хоста создать игру заново.',
          );
        } else if (refs.lobby) {
          refs.lobby.setNotice(SOFT_ERRORS[msg.code] ?? msg.message);
        } else {
          // На экранах игры и результата показать негде — хотя бы в лог.
          console.warn(`[2dots] ошибка хоста ${msg.code}: ${msg.message}`);
        }
      }),
      client.on('disconnect', ({ reason }) => {
        if (!live()) return;
        fail('Соединение потеряно', reason || 'Хост закрыл соединение.', NETWORK_HINT);
      }),
    );
    return s;
  }

  // ---------- создать игру ----------

  async function createGame(n: string): Promise<void> {
    if (busy) return;
    name = n;
    saveName(n);
    busy = true;
    let info: HostInfo;
    try {
      info = await deps.api.hostStart(n);
    } catch (err) {
      fail(
        'Не удалось создать игру',
        errorMessage(err),
        'Проверьте, что 2Dots разрешены входящие подключения, и попробуйте снова.',
      );
      return;
    } finally {
      busy = false;
    }

    const client = newClient();
    if (!client) {
      deps.api.hostStop().catch(() => undefined);
      return;
    }
    const s = openSession(client, true);
    clearRefs();
    const wait = hostWaitScreen({ info, onCancel: goHome });
    refs.hostWait = wait;
    router.show(wait);
    wait.setStatus('Подключаемся к своей игре…');
    try {
      s.you = await client.connect('127.0.0.1', info.port, n);
    } catch (err) {
      if (session !== s) return;
      fail('Не удалось подключиться к своей игре', errorMessage(err));
      return;
    }
    if (session !== s) return;
    refs.hostWait?.setStatus('Игра создана. Ждём подключения…');
    // Хост продолжает с той же игрой и правилами, что в прошлый раз.
    const last = loadLastGame();
    const gameId = last && getGame(last) ? last : DEFAULT_GAME_ID;
    if (gameId !== DEFAULT_GAME_ID) client.selectGame(gameId);
    const saved = loadSettings(gameId);
    if (saved) client.setConfig(saved);
    onLobby(s);
  }

  function changeSettings(s: Session, patch: Record<string, unknown>): void {
    saveSettings(s.lobby?.gameId ?? DEFAULT_GAME_ID, patch);
    s.client.setConfig(patch);
  }

  /** Смена игры хостом: сервер сбрасывает настройки на умолчания — возвращаем сохранённые. */
  function selectGame(s: Session, gameId: string): void {
    saveLastGame(gameId);
    s.client.selectGame(gameId);
    const saved = loadSettings(gameId);
    if (saved) s.client.setConfig(saved);
  }

  // ---------- присоединиться ----------

  function showJoin(): void {
    endSession();
    clearRefs();
    const screen = joinScreen({
      discover: () => deps.api.discoverHosts(),
      onBack: goHome,
      onConnect: (host, port) => void connectTo(screen, host, port),
    });
    router.show(screen);
  }

  async function connectTo(screen: JoinScreen, host: string, port: number): Promise<void> {
    if (session) return;
    const client = newClient();
    if (!client) return;
    const s = openSession(client, false);
    screen.setBusy(`Подключаемся к ${host}…`);
    try {
      s.you = await client.connect(host, port, name);
    } catch (err) {
      if (session !== s) return;
      endSession();
      screen.setBusy(null);
      screen.setError(`Не удалось подключиться: ${errorMessage(err)}`);
      return;
    }
    if (session !== s) return;
    onLobby(s);
    // lobby ещё не пришёл — остаёмся на экране присоединения
    if (router.screenId === 'join') screen.setBusy('Подключено. Ждём лобби…');
  }

  // ---------- лобби / игра / результат ----------

  function onLobby(s: Session, prev: LobbyMsg | null = null): void {
    const msg = s.lobby;
    if (!msg || !s.you) return;
    const hadOpponent = hasOpponent(prev, s.you);
    const opponentHere = hasOpponent(msg, s.you);
    switch (router.screenId) {
      case 'host-wait': {
        const opponent = msg.players.some((p) => p.id !== s.you && p.connected);
        if (opponent) showLobby(s);
        break;
      }
      case 'join':
        showLobby(s);
        break;
      case 'lobby':
        refs.lobby?.update(msg);
        // соперник (пере)подключился — старое «Соперник отключился…» больше не актуально
        if (opponentHere && !hadOpponent) refs.lobby?.setNotice(null);
        break;
      case 'result':
        refs.result?.setPlayers(msg.players);
        // Соперник ушёл после конца раунда: aborted сервер не шлёт (раунд уже засчитан).
        if (hadOpponent && !opponentHere) refs.result?.setNotice(OPPONENT_LEFT);
        break;
      // на экране игры просто запоминаем: туда вернёмся по «Ещё раз»
    }
  }

  function showLobby(s: Session, notice?: string): void {
    if (!s.lobby || !s.you) return;
    clearRefs();
    const client = s.client;
    const screen = lobbyScreen(
      {
        you: s.you,
        onReady: (ready) => client.setReady(ready),
        onSelect: (id) => selectGame(s, id),
        onConfig: (patch) => changeSettings(s, patch),
        onLeave: goHome,
      },
      s.lobby,
    );
    refs.lobby = screen;
    router.show(screen);
    if (notice) screen.setNotice(notice);
  }

  function showGame(s: Session, msg: Extract<ServerMsg, { t: 'start' }>): void {
    if (!s.you) return;
    clearRefs();
    const client = s.client;
    const screen = gameScreen({
      gameId: msg.gameId,
      you: s.you,
      countdownMs: msg.countdownMs,
      caption: getGameModule(msg.gameId)?.countdownCaption?.(msg.seed, msg.config, s.you) ?? null,
      names: namesFrom(s.lobby?.players),
      match: s.lobby?.match ?? {},
      onInput: (input) => client.sendInput(input),
      // Выход из раунда — в лобби, без отключения: сервер и соперник остаются.
      onLeave: () => {
        s.leftRound = true;
        client.leaveRound();
        if (s.lobby) s.lobby = withReady(s.lobby, () => false);
        showLobby(s);
      },
    });
    refs.game = screen;
    router.show(screen);
  }

  function showResult(s: Session, msg: Extract<ServerMsg, { t: 'end' }>): void {
    if (!s.you) return;
    const gameId = s.gameId ?? s.lobby?.gameId ?? '';
    // Счёт матча из end — lobby с ним придёт только после следующего изменения.
    if (s.lobby) s.lobby = { ...s.lobby, match: msg.match };
    clearRefs();
    const client = s.client;
    const screen = resultScreen({
      you: s.you,
      summary: (getGameModule(gameId)?.summarize ?? basicSummary)(msg.result),
      coop: getGame(gameId)?.kind === 'coop',
      names: namesFrom(s.lobby?.players),
      match: msg.match,
      matchWinner: msg.matchWinner,
      players: s.lobby?.players ?? [],
      onAgain: (ready) => {
        const you = s.you;
        // Соперник ушёл — ждать его на экране итога бессмысленно: в лобби, уже готовым.
        if (s.lobby && !hasOpponent(s.lobby, you)) {
          client.rematch();
          s.lobby = withReady(s.lobby, (p) => (p.id === you ? true : p.ready));
          showLobby(s, OPPONENT_LEFT);
          return;
        }
        // «Ещё раз» = сразу готов (сервер трактует rematch как ready: true); остаёмся
        // на экране итога и ждём соперника — раунд начнётся, когда готовы оба.
        if (ready) client.rematch();
        else client.setReady(false);
        if (s.lobby) {
          s.lobby = withReady(s.lobby, (p) => (p.id === you ? ready : p.ready));
          refs.result?.setPlayers(s.lobby.players);
        }
      },
      onLobby: () => {
        const you = s.you;
        if (s.lobby?.players.some((p) => p.id === you && p.ready)) {
          client.setReady(false);
          s.lobby = withReady(s.lobby, (p) => (p.id === you ? false : p.ready));
        }
        showLobby(s, s.lobby && !hasOpponent(s.lobby, you) ? OPPONENT_LEFT : undefined);
      },
      onMenu: goHome,
      confirmMenu: () => s.hosting && hasOpponent(s.lobby, s.you),
    });
    refs.result = screen;
    router.show(screen);
    if (s.lobby && !hasOpponent(s.lobby, s.you)) screen.setNotice(OPPONENT_LEFT);
  }

  goHome();
}
