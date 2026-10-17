import { h } from '../dom';
import type { Screen } from '../router';
import { button } from './common';

export interface ErrorProps {
  title: string;
  message: string;
  /** Что можно сделать — подсказка под сообщением. */
  hint?: string;
  onHome(): void;
}

export function errorScreen(props: ErrorProps): Screen {
  const home = button('В главное меню', {
    testid: 'error-home',
    variant: 'primary',
    hint: 'Enter',
    onClick: props.onHome,
  });
  const el = h(
    'main',
    { class: 'error centered', role: 'alert' },
    h(
      'div',
      { class: 'dots dots-md dots-broken', 'aria-hidden': 'true' },
      h('span', { class: 'dot p1' }),
      h('span', { class: 'dot p2' }),
    ),
    h('h2', { class: 'heading', testid: 'error-title' }, props.title),
    h('p', { class: 'error-message', testid: 'error-message' }, props.message),
    props.hint ? h('p', { class: 'muted small' }, props.hint) : null,
    h('div', { class: 'actions actions-row' }, home),
  );
  return {
    id: 'error',
    el,
    enter: props.onHome,
    escape: props.onHome,
    mounted: () => home.focus(),
  };
}
