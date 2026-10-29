// Клавиатурный ввод: удерживаемое направление.
// Последняя нажатая клавиша побеждает; отпускание возвращает к ещё удерживаемой
// (с небольшой задержкой, чтобы короткое нажатие поворота не терялось).
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

/**
 * Сколько мс после отпускания поворота держать его, если под ним ещё зажато прежнее
 * направление: короткое нажатие «вверх» на фоне удерживаемого «вправо» должно успеть
 * сработать на ближайшем перекрёстке (≈1,5 клетки при 7 клетках/с).
 */
export const TAP_HOLD_MS = 220;

export interface HeldDirs {
  press(code: string): void;
  release(code: string): void;
  releaseAll(): void;
  destroy(): void;
}

/**
 * Стек удерживаемых клавиш: последняя нажатая побеждает. Отпускание верхней клавиши, под
 * которой зажата другая, применяется с задержкой TAP_HOLD_MS (короткое нажатие — тоже поворот);
 * любое новое нажатие или отпускание всех клавиш применяется сразу.
 * onChange вызывается только при изменении итогового направления.
 */
export function createHeldDirs(keymap: KeyMap, onChange: (dir: Dir | null) => void): HeldDirs {
  const held: string[] = [];
  let current: Dir | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const emit = () => {
    cancel();
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

  return {
    press(code) {
      remove(code);
      held.push(code);
      emit();
    },
    release(code) {
      const wasTop = held[held.length - 1] === code;
      remove(code);
      if (wasTop && held.length > 0 && current !== null) {
        cancel();
        timer = setTimeout(emit, TAP_HOLD_MS);
      } else if (timer === null || held.length === 0) {
        emit();
      }
    },
    releaseAll() {
      held.length = 0;
      emit();
    },
    destroy: cancel,
  };
}

export function createKeyInput(keymap: KeyMap, onChange: (dir: Dir | null) => void): KeyInput {
  const dirs = createHeldDirs(keymap, onChange);
  const held = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
    if (!Object.hasOwn(keymap, e.code)) return;
    // Сочетания с Cmd/Ctrl/Alt (Cmd+W, Cmd+Q, Alt+Tab…) — системные, не ввод игры.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (e.repeat && held.has(e.code)) return;
    held.add(e.code);
    dirs.press(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!Object.hasOwn(keymap, e.code)) return;
    // Отпускание учитываем всегда (W, затем Cmd, затем отпустить W), но системные сочетания не трогаем.
    if (!(e.metaKey || e.ctrlKey || e.altKey)) e.preventDefault();
    held.delete(e.code);
    dirs.release(e.code);
  };
  // Потеря фокуса — keyup не придёт, отпускаем всё.
  const onBlur = () => {
    held.clear();
    dirs.releaseAll();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return {
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      dirs.destroy();
    },
  };
}
