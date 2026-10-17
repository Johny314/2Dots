// Контроллер экранов: связывает window.api (хост/поиск), GameClient и экраны.
import type { ErrorCode, PlayerId, ServerMsg } from '@2dots/core';
import type { GameClient } from '@2dots/net/client';
import type { DesktopApi, HostInfo } from '../../../shared/api';
import { errorMessage } from './dom';
import { summarizeResult } from './result';
import { Router } from './router';
import { saveName, loadName } from './storage';
import { namesFrom } from './screens/common';
import { errorScreen } from './screens/error';
import { gameScreen, type GameScreen } from './screens/game';
import { homeScreen } from './screens/home';
import { hostWaitScreen, type HostWaitScreen } from './screens/host-wait';
import { joinScreen, type JoinScreen } from './screens/join';
import { lobbyScreen, type LobbyScreen } from './screens/lobby';
import { resultScreen } from './screens/result';

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
  closed: boolean;
  offs: (() => void)[];
}

const NETWORK_HINT = 'Проверьте, что оба ноутбука в одной Wi‑Fi сети, и попробуйте снова.';

const SOFT_ERRORS: Partial<Record<ErrorCode, string>> = {
  not_host: 'Игру выбирает хост',
  unknown_game: 'Такой мини-игры нет у хоста — обновите приложение',
  bad_msg: 'Хост не понял сообщение — возможно, разные версии приложения',
};

export function startApp(root: HTMLElement, deps: AppDeps): void {
  const router = new Router(root);
  let name = loadName();
  let session: Session | null = null;
  let busy = false;

  // Активные экраны, которые обновляются на месте.
  const refs: {
    hostWait: HostWaitScreen | null;
    lobby: LobbyScreen | null;
    game: GameScreen | null;
  } = { hostWait: null, lobby: null, game: null };

  function clearRefs(): void {
    refs.hostWait = refs.lobby = refs.game = null;
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
    const s: Session = { client, hosting, you: null, lobby: null, closed: false, offs: [] };
    session = s;
    const live = () => session === s && !s.closed;

    s.offs.push(
      client.on('lobby', (msg) => {
        if (!live()) return;
        s.lobby = msg;
        onLobby(s);
      }),
      client.on('start', (msg) => {
        if (!live() || !s.you) return;
        showGame(s, msg);
      }),
      client.on('state', (msg) => {
        if (live()) refs.game?.update(msg.state);
      }),
      client.on('end', (msg) => {
        if (!live() || !s.you) return;
        showResult(s, msg);
      }),
      client.on('aborted', () => {
        if (!live()) return;
        showLobby(s, 'Соперник отключился — раунд не засчитан');
      }),
      client.on('error', (msg) => {
        if (!live()) return;
        if (msg.code === 'version') {
          fail(
            'Разные версии игры',
            msg.message,
            'Обновите 2Dots на обоих ноутбуках до одной версии.',
          );
        } else if (msg.code === 'full') {
          fail(
            'Игра уже занята',
            'В этой игре уже двое игроков.',
            'Попросите хоста создать игру заново.',
          );
        } else {
          refs.lobby?.setNotice(SOFT_ERRORS[msg.code] ?? msg.message);
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
      info = await deps.api.hostStart();
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
    onLobby(s);
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

  function onLobby(s: Session): void {
    const msg = s.lobby;
    if (!msg || !s.you) return;
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
        break;
      // на экранах игры и результата просто запоминаем: туда вернёмся по «Ещё раз»
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
        onSelect: (id) => client.selectGame(id),
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
      names: namesFrom(s.lobby?.players),
      match: s.lobby?.match ?? {},
      onInput: (input) => client.sendInput(input),
      onLeave: goHome,
    });
    refs.game = screen;
    router.show(screen);
  }

  function showResult(s: Session, msg: Extract<ServerMsg, { t: 'end' }>): void {
    if (!s.you) return;
    clearRefs();
    const client = s.client;
    router.show(
      resultScreen({
        you: s.you,
        summary: summarizeResult(msg.result),
        names: namesFrom(s.lobby?.players),
        match: msg.match,
        matchWinner: msg.matchWinner,
        onAgain: () => {
          client.rematch();
          showLobby(s);
        },
        onMenu: goHome,
      }),
    );
  }

  goHome();
}
