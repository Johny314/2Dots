import { describe, expect, it } from 'vitest';
import { turnFor, type KeyLike } from './input';

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe('tron: ввод поворотов', () => {
  it('стрелки и WASD → направление', () => {
    expect(turnFor(key('ArrowUp'))).toBe('up');
    expect(turnFor(key('ArrowLeft'))).toBe('left');
    expect(turnFor(key('KeyS'))).toBe('down');
    expect(turnFor(key('KeyD'))).toBe('right');
  });

  it('чужие клавиши, автоповтор и сочетания с Cmd/Ctrl/Alt — не поворот', () => {
    expect(turnFor(key('Space'))).toBeNull();
    expect(turnFor(key('toString'))).toBeNull();
    expect(turnFor(key('ArrowUp', { repeat: true }))).toBeNull();
    expect(turnFor(key('KeyW', { metaKey: true }))).toBeNull();
    expect(turnFor(key('KeyA', { ctrlKey: true }))).toBeNull();
    expect(turnFor(key('ArrowDown', { altKey: true }))).toBeNull();
  });
});
