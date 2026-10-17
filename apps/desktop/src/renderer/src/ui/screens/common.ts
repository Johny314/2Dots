import type { LobbyPlayer, PlayerId } from '@2dots/core';
import { h, kbd } from '../dom';

export interface ButtonOptions {
  testid: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Подсказка клавиши (Enter / Esc). */
  hint?: string;
  onClick: () => void;
}

export function button(label: string, opts: ButtonOptions): HTMLButtonElement {
  const btn = h(
    'button',
    { type: 'button', class: `btn btn-${opts.variant ?? 'secondary'}`, testid: opts.testid },
    h('span', { class: 'btn-label' }, label),
    opts.hint ? kbd(opts.hint) : null,
  );
  btn.addEventListener('click', () => {
    if (!btn.disabled) opts.onClick();
  });
  return btn;
}

export function setButtonLabel(btn: HTMLButtonElement, label: string): void {
  const el = btn.querySelector('.btn-label');
  if (el) el.textContent = label;
}

export const DEFAULT_NAMES: Record<PlayerId, string> = { p1: 'Игрок 1', p2: 'Игрок 2' };

export type Names = Record<PlayerId, string>;

export function namesFrom(players: readonly LobbyPlayer[] | undefined): Names {
  const names = { ...DEFAULT_NAMES };
  for (const p of players ?? []) names[p.id] = p.name;
  return names;
}

export function playerDot(id: PlayerId): HTMLElement {
  return h('span', { class: `dot dot-inline ${id}`, 'aria-hidden': 'true' });
}

export function matchScore(match: Partial<Record<PlayerId, number>>, testid: string): HTMLElement {
  return h(
    'div',
    { class: 'match-score', testid, 'aria-label': `Счёт матча ${match.p1 ?? 0}:${match.p2 ?? 0}` },
    h('span', { class: 'p1-text' }, String(match.p1 ?? 0)),
    h('span', { class: 'match-sep' }, ':'),
    h('span', { class: 'p2-text' }, String(match.p2 ?? 0)),
  );
}
