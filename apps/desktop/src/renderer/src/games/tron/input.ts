// Ввод «Трона»: поворот — только в момент нажатия. Отпускание клавиш ничего не шлёт
// (в отличие от удерживаемого направления лабиринта), автоповтор и системные сочетания игнорируются.
import { ARROWS, WASD } from '../maze/input';
import type { Dir } from './types';

export const TURN_KEYS: Readonly<Record<string, Dir>> = { ...WASD, ...ARROWS };

export interface KeyLike {
  code: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/** Направление для нажатия; null — не поворот (чужая клавиша, автоповтор, Cmd/Ctrl/Alt). */
export function turnFor(e: KeyLike): Dir | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  return Object.hasOwn(TURN_KEYS, e.code) ? (TURN_KEYS[e.code] ?? null) : null;
}

export function createTurnInput(onTurn: (dir: Dir) => void): { destroy(): void } {
  const onKeyDown = (e: KeyboardEvent) => {
    // Удерживаемую клавишу (автоповтор) тоже гасим, чтобы окно не прокручивалось.
    if (Object.hasOwn(TURN_KEYS, e.code) && !(e.metaKey || e.ctrlKey || e.altKey)) {
      e.preventDefault();
    }
    const dir = turnFor(e);
    if (dir) onTurn(dir);
  };
  window.addEventListener('keydown', onKeyDown);
  return {
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
