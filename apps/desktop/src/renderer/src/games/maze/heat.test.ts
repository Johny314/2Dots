import { describe, expect, it } from 'vitest';
import { maze } from '@2dots/core';
import { HeatTracker, heatColor, heatWord } from './heat';

function stateAt(p1: [number, number], p2: [number, number]): maze.MazeState {
  const config = { ...maze.mazeGame.defaultConfig(), width: 9, height: 7, hotCold: true };
  const s = maze.mazeGame.init(42, ['p1', 'p2'], config);
  s.players.p1.x = p1[0];
  s.players.p1.y = p1[1];
  s.players.p2.x = p2[0];
  s.players.p2.y = p2[1];
  return s;
}

describe('HeatTracker', () => {
  it('на старте холодно (0), в одной клетке горячо (1)', () => {
    const t = new HeatTracker();
    const start = stateAt([0, 0], [8, 6]);
    expect(t.read(start, 'p1', 0).heat).toBe(0);
    expect(new HeatTracker().read(stateAt([4, 3], [4, 3]), 'p2', 0)).toMatchObject({
      heat: 1,
      distance: 0,
    });
  });

  it('расстояние считается по проходам лабиринта', () => {
    const s = stateAt([0, 0], [8, 6]);
    const expected = maze.pathDistance(s.maze, [0, 0], [8, 6]);
    expect(new HeatTracker().read(s, 'p1', 0).distance).toBe(expected);
    // По прямой было бы 8 + 6 = 14; в идеальном лабиринте путь не короче.
    expect(expected).toBeGreaterThanOrEqual(14);
  });

  it('тренд: теплее при сближении, холоднее при удалении, нет — если стоим', () => {
    const t = new HeatTracker();
    const far = stateAt([0, 0], [8, 6]);
    expect(t.read(far, 'p1', 0).trend).toBeNull();
    // Двигаемся по пути навстречу: берём клетку, которая на 1 ближе к сопернику.
    const toOpp = maze.bfsDistances(far.maze, 8, 6);
    const next = [
      [1, 0],
      [0, 1],
    ].find(([x, y]) => toOpp[(y as number) * 9 + (x as number)] === (toOpp[0] as number) - 1) as [
      number,
      number,
    ];
    const closer = stateAt(next, [8, 6]);
    expect(t.read(closer, 'p1', 900).trend).toBe('warmer');
    expect(t.read(far, 'p1', 1800).trend).toBe('colder');
    expect(t.read(far, 'p1', 2700).trend).toBeNull();
  });
});

describe('подписи и цвет', () => {
  it('словесная шкала', () => {
    expect(heatWord(0)).toBe('Холодно');
    expect(heatWord(0.3)).toBe('Прохладно');
    expect(heatWord(0.6)).toBe('Тепло');
    expect(heatWord(0.8)).toBe('Горячо');
    expect(heatWord(0.95)).toBe('Обжигающе!');
  });

  it('цвет от синего к красному', () => {
    expect(heatColor(0)).toBe('hsla(220, 90%, 60%, 1)');
    expect(heatColor(1, 0.5)).toBe('hsla(0, 90%, 60%, 0.5)');
  });
});
