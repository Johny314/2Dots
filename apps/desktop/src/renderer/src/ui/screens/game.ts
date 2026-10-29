import { getGame, type PlayerId } from '@2dots/core';
import { getGameModule } from '../../games';
import type { GameView } from '../../games/types';
import { errorMessage, h } from '../dom';
import type { Screen } from '../router';
import { confirmDialog, matchScore, playerDot, type Names } from './common';

export interface GameProps {
  gameId: string;
  you: PlayerId;
  countdownMs: number;
  /** Подпись на отсчёте; по умолчанию — название игры. */
  caption?: string | null;
  names: Names;
  match: Partial<Record<PlayerId, number>>;
  onInput(input: unknown): void;
  onLeave(): void;
}

export interface GameScreen extends Screen {
  update(state: unknown): void;
  /** Сколько ещё мс идёт финальная анимация раунда (0 — можно показывать результат). */
  outroMs(): number;
}

export function gameScreen(props: GameProps): GameScreen {
  const canvas = h('canvas', { class: 'game-canvas', testid: 'game-canvas' });
  // Счёт, который рисует HUD на canvas, — для e2e (DOM-HUD при рендерере не показывается).
  canvas.dataset.match = `${props.match.p1 ?? 0}:${props.match.p2 ?? 0}`;
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
  const mount = getGameModule(props.gameId)?.mount;
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
    h('p', { class: 'countdown-caption', testid: 'countdown-caption' }, props.caption ?? title),
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
  const leave = confirmDialog(stage, {
    title: 'Выйти в лобби?',
    text: 'Раунд прервётся и не будет засчитан. Оба вернётесь в лобби — можно выбрать другую игру.',
    yes: 'В лобби',
    no: 'Продолжить',
    onYes: props.onLeave,
    testid: 'leave-confirm',
  });

  // Рендерер рисует имена и счёт сам (HUD на canvas); DOM-шапка — только для заглушки.
  const el = h('main', { class: view ? 'game no-hud' : 'game' }, view ? null : hud, stage);

  let ticks = 0;
  return {
    id: 'game',
    el,
    enter: () => {
      if (leave.isOpen) props.onLeave();
    },
    escape: () => (leave.isOpen ? leave.close() : leave.open()),
    update: (state) => {
      ticks += 1;
      if (view) {
        view.update(state);
      } else if (stubInfo) {
        const tick = stubInfo.querySelector('[data-testid="game-tick"]');
        if (tick) tick.textContent = `Получено состояний: ${ticks}`;
      }
    },
    outroMs: () => view?.outroMs?.() ?? 0,
    destroy: () => {
      if (countTimer) clearInterval(countTimer);
      view?.destroy();
      view = null;
    },
  };
}
