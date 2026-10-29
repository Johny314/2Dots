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

export interface ConfirmOptions {
  title: string;
  text: string;
  /** Подпись кнопки «да» (danger, Enter). */
  yes: string;
  /** Подпись кнопки «нет» (ghost, Esc). */
  no: string;
  onYes(): void;
  /** Префикс data-testid: <testid>, <testid>-yes, <testid>-no. */
  testid: string;
}

export interface ConfirmDialog {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

/** Модальное подтверждение поверх host: Enter — да, Esc — нет (Esc обрабатывает экран). */
export function confirmDialog(host: HTMLElement, opts: ConfirmOptions): ConfirmDialog {
  let el: HTMLElement | null = null;
  const close = () => {
    el?.remove();
    el = null;
  };
  return {
    get isOpen() {
      return el !== null;
    },
    open() {
      if (el) return;
      const no = button(opts.no, {
        testid: `${opts.testid}-no`,
        variant: 'ghost',
        hint: 'Esc',
        onClick: close,
      });
      const yes = button(opts.yes, {
        testid: `${opts.testid}-yes`,
        variant: 'danger',
        hint: 'Enter',
        onClick: opts.onYes,
      });
      const titleId = `${opts.testid}-title`;
      el = h(
        'div',
        {
          class: 'overlay confirm',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
          testid: opts.testid,
        },
        h(
          'div',
          { class: 'panel stack dialog' },
          h('h3', { id: titleId, class: 'subheading' }, opts.title),
          h('p', { class: 'muted' }, opts.text),
          h('div', { class: 'actions actions-row' }, no, yes),
        ),
      );
      host.append(el);
      // Фокус на «да»: Enter у кнопки в фокусе нажимает её (как подсказывает Enter на ней).
      yes.focus();
    },
    close,
  };
}
