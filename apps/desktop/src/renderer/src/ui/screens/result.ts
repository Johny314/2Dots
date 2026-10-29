import { MATCH_WINS, PLAYER_IDS, type LobbyPlayer, type PlayerId } from '@2dots/core';
import { dotsLogo, h } from '../dom';
import type { RoundSummary } from '../../games/types';
import type { Screen } from '../router';
import { button, confirmDialog, matchScore, playerDot, setButtonLabel, type Names } from './common';

export interface ResultProps {
  you: PlayerId;
  summary: RoundSummary;
  /** Кооперативная игра: итог общий, счёт матча не показывается. */
  coop: boolean;
  names: Names;
  match: Partial<Record<PlayerId, number>>;
  matchWinner: PlayerId | null;
  /** Игроки из лобби: кто уже нажал «Ещё раз». */
  players: readonly LobbyPlayer[];
  /** «Ещё раз» / «Отменить»: ready — новое состояние готовности. */
  onAgain(ready: boolean): void;
  /** К выбору игры в лобби — соединение и сервер остаются. */
  onLobby(): void;
  onMenu(): void;
  /** Спросить перед выходом в меню (хост с соперником: игра закроется и для него). */
  confirmMenu(): boolean;
}

export interface ResultScreen extends Screen {
  setNotice(text: string | null): void;
  /** Новое состояние лобби: готовность к следующему раунду. */
  setPlayers(players: readonly LobbyPlayer[]): void;
}

export function resultScreen(props: ResultProps): ResultScreen {
  const { summary, names, you, matchWinner } = props;

  let headline: string;
  let tone: string;
  if (matchWinner) {
    headline = matchWinner === you ? 'Матч выигран!' : `Победа в матче: ${names[matchWinner]}`;
    tone = matchWinner === you ? 'win' : 'lose';
  } else if (summary.winner === 'team') {
    headline = 'Вы справились!';
    tone = 'win';
  } else if (summary.winner === 'none') {
    headline = 'Не успели';
    tone = 'lose';
  } else if (summary.winner === 'draw') {
    headline = 'Ничья';
    tone = 'draw';
  } else if (summary.winner) {
    headline = summary.winner === you ? 'Победа!' : 'Поражение';
    tone = summary.winner === you ? 'win' : 'lose';
  } else {
    headline = 'Раунд окончен';
    tone = 'draw';
  }

  const reason = summary.reason;

  const rows = PLAYER_IDS.map((id) => {
    const pct = summary.percent[id];
    const label = summary.label[id];
    const isWinner = summary.winner === id;
    return h(
      'div',
      { class: `result-row ${id}${isWinner ? ' is-winner' : ''}`, testid: `result-${id}` },
      h(
        'div',
        { class: 'result-head' },
        playerDot(id),
        h('span', { class: 'player-name' }, names[id] + (id === you ? ' (вы)' : '')),
        h('span', { class: 'result-pct', testid: `result-pct-${id}` }, label ?? '—'),
      ),
      h(
        'div',
        {
          class: 'bar',
          role: 'meter',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': pct ?? 0,
          'aria-label': `${names[id]}: ${label ?? 'нет данных'}`,
        },
        h('span', { class: 'bar-fill', style: `width: ${pct ?? 0}%` }),
      ),
    );
  });

  const noDetails = PLAYER_IDS.every((id) => summary.label[id] === null);
  // Кооператив с общим итогом: одна строка вместо строк по игрокам.
  const body = summary.teamLabel
    ? [h('p', { class: 'team-result', testid: 'result-team' }, summary.teamLabel)]
    : noDetails
      ? [h('p', { class: 'muted small' }, 'Подробный счёт для этой игры недоступен')]
      : rows;

  const againLabel = matchWinner ? 'Новый матч' : 'Ещё раз';
  let players = props.players;
  const meReady = () => players.some((p) => p.id === you && p.ready);
  const toggleAgain = () => props.onAgain(!meReady());
  const againBtn = button(againLabel, {
    testid: 'again',
    variant: 'primary',
    hint: 'Enter',
    onClick: toggleAgain,
  });

  const notice = h('p', { class: 'notice', role: 'status', testid: 'result-notice', hidden: true });

  // Кто готов к следующему раунду, а кого ждём.
  const readyRow = h('div', { class: 'rematch', testid: 'rematch' });
  const readyHint = h('p', { class: 'muted small rematch-hint', testid: 'rematch-hint' });
  function renderReady(): void {
    const opponent = players.find((p) => p.id !== you && p.connected);
    readyRow.replaceChildren(
      ...PLAYER_IDS.map((id) => {
        const p = players.find((pl) => pl.id === id && pl.connected);
        const status = !p ? 'ушёл' : p.ready ? 'готов' : 'смотрит итоги';
        return h(
          'span',
          { class: `rematch-chip ${id}${p?.ready ? ' on' : ''}`, testid: `rematch-${id}` },
          playerDot(id),
          h('span', { class: 'rematch-name' }, names[id] + (id === you ? ' (вы)' : '')),
          h('span', { class: 'rematch-status' }, status),
        );
      }),
    );
    const mine = meReady();
    setButtonLabel(againBtn, mine ? 'Отменить' : againLabel);
    againBtn.classList.toggle('is-on', mine);
    againBtn.setAttribute('aria-pressed', mine ? 'true' : 'false');
    readyHint.textContent = !opponent
      ? ''
      : mine && opponent.ready
        ? 'Оба готовы — начинаем!'
        : mine
          ? `Ждём, когда ${opponent.name} нажмёт «${againLabel}»…`
          : opponent.ready
            ? `${opponent.name} хочет сыграть ещё — нажмите «${againLabel}»`
            : `Раунд начнётся, когда оба нажмут «${againLabel}»`;
  }
  renderReady();

  const menu = confirmDialog(document.body, {
    title: 'Закрыть игру?',
    text: 'Вы — хост: игра закроется, и соперник отключится. Чтобы выбрать другую мини-игру, нажмите «К выбору игры».',
    yes: 'Закрыть',
    no: 'Остаться',
    onYes: props.onMenu,
    testid: 'menu-confirm',
  });
  const goMenu = () => (props.confirmMenu() ? menu.open() : props.onMenu());

  const el = h(
    'main',
    { class: `result centered tone-${tone}` },
    dotsLogo('sm'),
    h('h2', { class: 'heading result-headline', testid: 'result-headline' }, headline),
    reason ? h('p', { class: 'muted' }, reason) : null,
    notice,
    h('section', { class: 'panel stack' }, ...body),
    props.coop
      ? null
      : h(
          'div',
          { class: 'lobby-match' },
          h(
            'span',
            { class: 'muted small' },
            matchWinner ? 'Итог матча' : `Счёт матча · до ${MATCH_WINS} побед`,
          ),
          matchScore(props.match, 'result-match'),
        ),
    readyRow,
    h(
      'div',
      { class: 'actions actions-row' },
      button('В меню', {
        testid: 'result-menu',
        variant: 'ghost',
        hint: 'Esc',
        onClick: goMenu,
      }),
      button('К выбору игры', { testid: 'result-lobby', onClick: props.onLobby }),
      againBtn,
    ),
    readyHint,
  );

  return {
    id: 'result',
    el,
    enter: () => (menu.isOpen ? props.onMenu() : toggleAgain()),
    escape: () => (menu.isOpen ? menu.close() : goMenu()),
    destroy: menu.close,
    mounted: () => againBtn.focus(),
    setNotice: (text) => {
      notice.textContent = text ?? '';
      notice.hidden = !text;
    },
    setPlayers: (next) => {
      players = next;
      renderReady();
    },
  };
}
