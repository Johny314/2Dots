// Клавиатурный ввод: удерживаемое направление.
// Последняя нажатая клавиша побеждает; отпускание возвращает к ещё удерживаемой.
import type { maze } from '@2dots/core';

type Dir = maze.Dir;

export type KeyMap = Readonly<Record<string, Dir>>;

export const WASD: KeyMap = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };
export const ARROWS: KeyMap = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowDown: 'down',
  ArrowRight: 'right',
};

export interface KeyInput {
  destroy(): void;
}

/** onChange вызывается только при изменении итогового направления. */
export function createKeyInput(keymap: KeyMap, onChange: (dir: Dir | null) => void): KeyInput {
  const held: string[] = [];
  let current: Dir | null = null;

  const emit = () => {
    const top = held[held.length - 1];
    const next = top === undefined ? null : (keymap[top] ?? null);
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const remove = (code: string) => {
    const i = held.indexOf(code);
    if (i >= 0) held.splice(i, 1);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!Object.hasOwn(keymap, e.code)) return;
    e.preventDefault();
    if (e.repeat && held.includes(e.code)) return;
    remove(e.code);
    held.push(e.code);
    emit();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!Object.hasOwn(keymap, e.code)) return;
    e.preventDefault();
    remove(e.code);
    emit();
  };
  // Потеря фокуса — keyup не придёт, отпускаем всё.
  const onBlur = () => {
    held.length = 0;
    emit();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return {
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
