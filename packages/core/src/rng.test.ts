import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('одинаковый seed даёт одинаковую последовательность', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('разные seed дают разные последовательности', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('next в [0, 1), int в [0, max)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.int(5);
      expect(Number.isInteger(n) && n >= 0 && n < 5).toBe(true);
    }
  });

  it('shuffle сохраняет элементы', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(new Rng(3).shuffle([...arr]).sort()).toEqual(arr);
  });
});
