import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARROWS, createHeldDirs, TAP_HOLD_MS } from './input';

describe('maze: удерживаемое направление', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const seen: (string | null)[] = [];
    const dirs = createHeldDirs(ARROWS, (dir) => seen.push(dir));
    return { dirs, seen };
  };

  it('последняя нажатая клавиша побеждает', () => {
    const { dirs, seen } = setup();
    dirs.press('ArrowRight');
    dirs.press('ArrowUp');
    expect(seen).toEqual(['right', 'up']);
  });

  it('короткое нажатие поворота держится TAP_HOLD_MS, потом — снова прежнее направление', () => {
    const { dirs, seen } = setup();
    dirs.press('ArrowRight');
    dirs.press('ArrowUp');
    dirs.release('ArrowUp');
    expect(seen).toEqual(['right', 'up']);
    vi.advanceTimersByTime(TAP_HOLD_MS - 1);
    expect(seen).toEqual(['right', 'up']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['right', 'up', 'right']);
  });

  it('новое нажатие во время задержки применяется сразу', () => {
    const { dirs, seen } = setup();
    dirs.press('ArrowRight');
    dirs.press('ArrowUp');
    dirs.release('ArrowUp');
    dirs.press('ArrowDown');
    expect(seen).toEqual(['right', 'up', 'down']);
    vi.advanceTimersByTime(TAP_HOLD_MS * 2);
    expect(seen).toEqual(['right', 'up', 'down']);
  });

  it('отпустили всё — остановка сразу', () => {
    const { dirs, seen } = setup();
    dirs.press('ArrowRight');
    dirs.press('ArrowUp');
    dirs.release('ArrowUp');
    dirs.release('ArrowRight');
    expect(seen).toEqual(['right', 'up', null]);
    dirs.press('ArrowLeft');
    dirs.releaseAll();
    expect(seen).toEqual(['right', 'up', null, 'left', null]);
  });

  it('отпускание единственной клавиши — без задержки', () => {
    const { dirs, seen } = setup();
    dirs.press('ArrowRight');
    dirs.release('ArrowRight');
    expect(seen).toEqual(['right', null]);
  });
});
