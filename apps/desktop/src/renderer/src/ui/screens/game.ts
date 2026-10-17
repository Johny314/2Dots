import { getGame, type PlayerId } from '@2dots/core';
import { GAME_VIEWS } from '../../games';
import type { GameView } from '../../games/types';
import { errorMessage, h } from '../dom';
import type { Screen } from '../router';
import { button, matchScore, playerDot, type Names } from './common';

export interface GameProps {
  gameId: string;
  you: PlayerId;
  countdownMs: number;
  names: Names;
  match: Partial<Record<PlayerId, number>>;
  onInput(input: unknown): void;
  onLeave(): void;
}

export interface GameScreen extends Screen {
  update(state: unknown): void;
}

export function gameScreen(props: GameProps): GameScreen {
  const canvas = h('canvas', { class: 'game-canvas', testid: 'game-canvas' });
  const title = getGame(props.gameId)?.title ?? props.gameId;

  const hud = h(
    'header',
    { class: 'game-hud' },
    h(
      'span',
      { class: `hud-player p1${props.you === 'p1' ? ' is-you' : ''}` },
      playerDot('p1'),
      props.names.p1,
    ),
    matchScore(props.match, 'game-match'),
    h(
      'span',
      { class: `hud-player p2${props.you === 'p2' ? ' is-you' : ''}` },
      props.names.p2,
      playerDot('p2'),
    ),
  );

  const stage = h('div', { class: 'game-stage' }, canvas);

  // Рендерер мини-игры (трек E) или заглушка.
  let view: GameView | null = null;
  let stubInfo: HTMLElement | null = null;
  const mount = GAME_VIEWS[props.gameId];
  if (mount) {
    try {
      view = mount(canvas, {
        you: props.you,
        names: props.names,
        match: { p1: props.match.p1 ?? 0, p2: props.match.p2 ?? 0 },
        onInput: props.onInput,
      });
    } catch (err) {
      stubInfo = stub(`Не удалось запустить «${title}»: ${errorMessage(err)}`);
    }
  } else {
    stubInfo = stub(`Рендерер «${title}» ещё не подключён`);
  }
  if (stubInfo) stage.append(stubInfo);

  function stub(text: string): HTMLElement {
    return h(
      'div',
      { class: 'game-stub', testid: 'game-stub' },
      h('p', {}, text),
      h('p', { class: 'muted small', testid: 'game-tick' }, 'Ждём состояние…'),
    );
  }

  // ---------- отсчёт 3‑2‑1 ----------
  const countNum = h('span', { class: 'countdown-num', testid: 'countdown-value' });
  const countdown = h(
    'div',
    {
      class: 'overlay countdown',
      testid: 'screen-countdown',
      role: 'status',
      'aria-live': 'assertive',
    },
    h('p', { class: 'countdown-caption' }, title),
    countNum,
  );
  let countTimer: ReturnType<typeof setInterval> | null = null;
  const startAt = performance.now();
  const renderCount = () => {
    const left = props.countdownMs - (performance.now() - startAt);
    if (left <= 0) {
      countNum.textContent = 'Вперёд!';
      countNum.classList.add('go');
      if (countTimer) clearInterval(countTimer);
      countTimer = null;
      setTimeout(() => countdown.remove(), 600);
      return;
    }
    const n = String(Math.ceil(left / 1000));
    if (countNum.textContent !== n) {
      countNum.textContent = n;
      // перезапуск анимации «пульса»
      countNum.classList.remove('tick');
      void countNum.offsetWidth;
      countNum.classList.add('tick');
    }
  };
  if (props.countdownMs > 0) {
    renderCount();
    countTimer = setInterval(renderCount, 100);
    stage.append(countdown);
  }

  // ---------- подтверждение выхода ----------
  let confirmEl: HTMLElement | null = null;
  const closeConfirm = () => {
    confirmEl?.remove();
    confirmEl = null;
  };
  const openConfirm = () => {
    if (confirmEl) return;
    const stay = button('Продолжить', {
      testid: 'leave-cancel',
      variant: 'ghost',
      hint: 'Esc',
      onClick: closeConfirm,
    });
    confirmEl = h(
      'div',
      {
        class: 'overlay confirm',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'leave-title',
        testid: 'leave-confirm',
      },
      h(
        'div',
        { class: 'panel stack dialog' },
        h('h3', { id: 'leave-title', class: 'subheading' }, 'Выйти из игры?'),
        h('p', { class: 'muted' }, 'Раунд прервётся и не будет засчитан.'),
        h(
          'div',
          { class: 'actions actions-row' },
          stay,
          button('Выйти', {
            testid: 'leave-confirm-yes',
            variant: 'danger',
            hint: 'Enter',
            onClick: props.onLeave,
          }),
        ),
      ),
    );
    stage.append(confirmEl);
    stay.focus();
  };

  // Рендерер рисует имена и счёт сам (HUD на canvas); DOM-шапка — только для заглушки.
  const el = h('main', { class: view ? 'game no-hud' : 'game' }, view ? null : hud, stage);

  let ticks = 0;
  return {
    id: 'game',
    el,
    enter: () => {
      if (confirmEl) props.onLeave();
    },
    escape: () => (confirmEl ? closeConfirm() : openConfirm()),
    update: (state) => {
      ticks += 1;
      if (view) {
        view.update(state);
      } else if (stubInfo) {
        const tick = stubInfo.querySelector('[data-testid="game-tick"]');
        if (tick) tick.textContent = `Получено состояний: ${ticks}`;
      }
    },
    destroy: () => {
      if (countTimer) clearInterval(countTimer);
      view?.destroy();
      view = null;
    },
  };
}
