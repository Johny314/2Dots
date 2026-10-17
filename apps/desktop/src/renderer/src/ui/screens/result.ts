import { MATCH_WINS, PLAYER_IDS, type PlayerId } from '@2dots/core';
import { dotsLogo, h } from '../dom';
import type { RoundSummary } from '../result';
import type { Screen } from '../router';
import { button, matchScore, playerDot, type Names } from './common';

export interface ResultProps {
  you: PlayerId;
  summary: RoundSummary;
  names: Names;
  match: Partial<Record<PlayerId, number>>;
  matchWinner: PlayerId | null;
  onAgain(): void;
  onMenu(): void;
}

export function resultScreen(props: ResultProps): Screen {
  const { summary, names, you, matchWinner } = props;

  let headline: string;
  let tone: string;
  if (matchWinner) {
    headline = matchWinner === you ? 'Матч выигран!' : `Победа в матче: ${names[matchWinner]}`;
    tone = matchWinner === you ? 'win' : 'lose';
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

  const reason =
    summary.reason === 'met'
      ? 'Вы встретились'
      : summary.reason === 'timeout'
        ? 'Время вышло'
        : null;

  const rows = PLAYER_IDS.map((id) => {
    const pct = summary.percent[id];
    const isWinner = summary.winner === id;
    return h(
      'div',
      { class: `result-row ${id}${isWinner ? ' is-winner' : ''}`, testid: `result-${id}` },
      h(
        'div',
        { class: 'result-head' },
        playerDot(id),
        h('span', { class: 'player-name' }, names[id] + (id === you ? ' (вы)' : '')),
        h(
          'span',
          { class: 'result-pct', testid: `result-pct-${id}` },
          pct === null ? '—' : `${pct}% пути`,
        ),
      ),
      h(
        'div',
        {
          class: 'bar',
          role: 'meter',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': pct ?? 0,
          'aria-label': `${names[id]}: ${pct === null ? 'нет данных' : `${pct}% пути`}`,
        },
        h('span', { class: 'bar-fill', style: `width: ${pct ?? 0}%` }),
      ),
    );
  });

  const unknown = PLAYER_IDS.every((id) => summary.percent[id] === null)
    ? h('p', { class: 'muted small' }, 'Подробный счёт для этой игры недоступен')
    : null;

  const againLabel = matchWinner ? 'Новый матч' : 'Ещё раз';
  const againBtn = button(againLabel, {
    testid: 'again',
    variant: 'primary',
    hint: 'Enter',
    onClick: props.onAgain,
  });

  const el = h(
    'main',
    { class: `result centered tone-${tone}` },
    dotsLogo('sm'),
    h('h2', { class: 'heading result-headline', testid: 'result-headline' }, headline),
    reason ? h('p', { class: 'muted' }, reason) : null,
    h('section', { class: 'panel stack' }, ...rows, unknown),
    h(
      'div',
      { class: 'lobby-match' },
      h(
        'span',
        { class: 'muted small' },
        matchWinner ? 'Итог матча' : `Счёт матча · до ${MATCH_WINS} побед`,
      ),
      matchScore(props.match, 'result-match'),
    ),
    h(
      'div',
      { class: 'actions actions-row' },
      button('В меню', {
        testid: 'result-menu',
        variant: 'ghost',
        hint: 'Esc',
        onClick: props.onMenu,
      }),
      againBtn,
    ),
  );

  return {
    id: 'result',
    el,
    enter: props.onAgain,
    escape: props.onMenu,
    mounted: () => againBtn.focus(),
  };
}
