import { GAMES, getGame, MATCH_WINS, PLAYER_IDS, type PlayerId, type ServerMsg } from '@2dots/core';
import { h } from '../dom';
import type { Screen } from '../router';
import { button, confirmDialog, matchScore, playerDot, setButtonLabel } from './common';
import { settingsPanel } from './settings';

type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>;

export interface LobbyProps {
  you: PlayerId;
  onReady(ready: boolean): void;
  onSelect(gameId: string): void;
  onConfig(patch: Record<string, unknown>): void;
  onLeave(): void;
}

export interface LobbyScreen extends Screen {
  update(lobby: LobbyMsg): void;
  setNotice(text: string | null): void;
}

export function lobbyScreen(props: LobbyProps, initial: LobbyMsg): LobbyScreen {
  const isHost = props.you === 'p1';
  let lobby = initial;

  const players = h('div', { class: 'players', testid: 'lobby-players' });
  const notice = h('p', { class: 'notice', role: 'status', testid: 'lobby-notice', hidden: true });
  const score = h('div', { class: 'lobby-match' });
  const games = h('div', {
    class: 'game-picker',
    role: 'radiogroup',
    'aria-label': 'Мини-игра',
    testid: 'game-picker',
  });
  const readyBtn = button('Готов', {
    testid: 'ready',
    variant: 'primary',
    hint: 'Enter',
    onClick: () => toggleReady(),
  });
  // Хост закрывает игру и для соперника — спрашиваем, если соперник уже здесь.
  const leaveConfirm = confirmDialog(document.body, {
    title: 'Закрыть игру?',
    text: 'Вы — хост: игра закроется, и соперник отключится.',
    yes: 'Закрыть',
    no: 'Остаться',
    onYes: props.onLeave,
    testid: 'menu-confirm',
  });
  const leave = () => {
    const opponentHere = lobby.players.some((p) => p.id !== props.you && p.connected);
    if (isHost && opponentHere) leaveConfirm.open();
    else props.onLeave();
  };
  const leaveBtn = button('Выйти', {
    testid: 'lobby-leave',
    variant: 'ghost',
    hint: 'Esc',
    onClick: leave,
  });
  const readyHint = h('p', { class: 'muted small' });
  const settings = settingsPanel({ isHost, onChange: props.onConfig });

  const me = () => lobby.players.find((p) => p.id === props.you);

  function toggleReady(): void {
    const current = me();
    if (!current) return;
    props.onReady(!current.ready);
  }

  function render(): void {
    players.replaceChildren(
      ...PLAYER_IDS.map((id) => {
        const p = lobby.players.find((pl) => pl.id === id && pl.connected);
        const role = id === 'p1' ? 'Хост' : 'Гость';
        const you = id === props.you;
        return h(
          'div',
          {
            class: `player-card ${id}${p?.ready ? ' is-ready' : ''}${p ? '' : ' is-empty'}`,
            testid: `player-${id}`,
          },
          playerDot(id),
          h(
            'div',
            { class: 'player-info' },
            h('span', { class: 'player-name' }, p ? p.name : 'Ждём соперника…'),
            h('span', { class: 'player-role' }, you ? `${role} · вы` : role),
          ),
          h(
            'span',
            { class: `ready-badge${p?.ready ? ' on' : ''}`, testid: `ready-${id}` },
            p ? (p.ready ? 'Готов' : 'Не готов') : '',
          ),
        );
      }),
    );

    games.replaceChildren(
      ...Object.values(GAMES).map((g) => {
        const selected = g.id === lobby.gameId;
        const item = h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: `game-option${selected ? ' selected' : ''}`,
            'aria-checked': selected ? 'true' : 'false',
            testid: `game-${g.id}`,
            disabled: !isHost,
          },
          h('span', { class: 'game-title' }, g.title),
          h('span', { class: 'game-desc' }, g.description),
          g.kind === 'coop' ? h('span', { class: 'game-badge' }, 'вместе') : null,
        );
        item.addEventListener('click', () => {
          if (isHost && g.id !== lobby.gameId) props.onSelect(g.id);
        });
        return item;
      }),
    );

    settings.update(lobby.gameId, lobby.config);

    // Кооператив: играете вместе — счёт матча не ведётся.
    score.replaceChildren(
      ...(getGame(lobby.gameId)?.kind === 'coop'
        ? [h('span', { class: 'muted small' }, 'Кооператив: играете вместе против таймера')]
        : [
            h('span', { class: 'muted small' }, `Матч до ${MATCH_WINS} побед`),
            matchScore(lobby.match, 'lobby-match'),
          ]),
    );

    const mine = me();
    const ready = mine?.ready ?? false;
    const opponentHere = lobby.players.some((p) => p.id !== props.you && p.connected);
    setButtonLabel(readyBtn, ready ? 'Отменить готовность' : 'Готов');
    readyBtn.setAttribute('aria-pressed', ready ? 'true' : 'false');
    readyBtn.classList.toggle('is-on', ready);
    readyHint.textContent = !opponentHere
      ? 'Соперник ещё не подключился'
      : ready
        ? 'Ждём, когда соперник будет готов…'
        : isHost
          ? 'Выберите игру и настройки, затем нажмите «Готов»'
          : 'Игру выбирает хост. Нажмите «Готов»';
  }

  const el = h(
    'main',
    { class: 'lobby centered' },
    h('h2', { class: 'heading' }, 'Лобби'),
    notice,
    players,
    h(
      'section',
      { class: 'panel lobby-panel' },
      h(
        'div',
        { class: 'lobby-games stack' },
        h('h3', { class: 'subheading' }, isHost ? 'Мини-игра' : 'Мини-игра (выбирает хост)'),
        games,
      ),
      h('div', { class: 'lobby-side stack' }, settings.el, score),
    ),
    h('div', { class: 'actions actions-row' }, leaveBtn, readyBtn),
    readyHint,
  );
  render();

  return {
    id: 'lobby',
    el,
    enter: () => (leaveConfirm.isOpen ? props.onLeave() : toggleReady()),
    escape: () => (leaveConfirm.isOpen ? leaveConfirm.close() : leave()),
    destroy: leaveConfirm.close,
    mounted: () => readyBtn.focus(),
    update: (next) => {
      lobby = next;
      const focusedTestId = (document.activeElement as HTMLElement | null)?.dataset.testid;
      render();
      // перерисовка кнопок игр не должна терять фокус
      if (focusedTestId?.startsWith('game-')) {
        el.querySelector<HTMLElement>(`[data-testid="${focusedTestId}"]`)?.focus();
      }
    },
    setNotice: (text) => {
      notice.textContent = text ?? '';
      notice.hidden = !text;
    },
  };
}
