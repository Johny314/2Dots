import { describe, expect, it } from 'vitest';
import { cellsWord, summarizeMaze } from './summary';

describe('summarizeMaze', () => {
  it('лабиринт, уникальные клетки: число клеток и % лабиринта', () => {
    const s = summarizeMaze({
      winner: 'p1',
      reason: 'met',
      scores: { p1: 63, p2: 21 },
      pathLength: 30,
      meetCell: [1, 1],
      scoring: 'distinct',
      totalCells: 315,
    });
    expect(s).toEqual({
      winner: 'p1',
      reason: 'Вы встретились',
      percent: { p1: 20, p2: 7 },
      label: { p1: '63 клетки · 20% лабиринта', p2: '21 клетка · 7% лабиринта' },
    });
  });

  it('лабиринт, bfs (и старые версии без scoring): проценты пути', () => {
    const s = summarizeMaze({
      winner: 'p1',
      reason: 'met',
      scores: { p1: 15, p2: 9 },
      pathLength: 30,
      meetCell: [1, 1],
    });
    expect(s.percent).toEqual({ p1: 50, p2: 30 });
    expect(s.label).toEqual({ p1: '50% пути', p2: '30% пути' });
  });

  it('склонение слова «клетка»', () => {
    const cases: [number, string][] = [
      [1, 'клетка'],
      [2, 'клетки'],
      [5, 'клеток'],
      [11, 'клеток'],
      [12, 'клеток'],
      [21, 'клетка'],
      [22, 'клетки'],
      [111, 'клеток'],
    ];
    for (const [n, word] of cases) expect(cellsWord(n), String(n)).toBe(word);
  });

  it('мусор и неизвестные игры — без падений', () => {
    expect(summarizeMaze(null).percent).toEqual({ p1: null, p2: null });
    expect(summarizeMaze({ winner: 'x', scores: { p1: 1 }, pathLength: 0 })).toEqual({
      winner: null,
      reason: null,
      percent: { p1: null, p2: null },
      label: { p1: null, p2: null },
    });
    expect(summarizeMaze({ scores: { p1: 99, p2: -1 }, pathLength: 10 }).percent).toEqual({
      p1: 100,
      p2: null,
    });
  });
});
