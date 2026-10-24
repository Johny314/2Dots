import { describe, expect, it } from 'vitest';
import { impactPoint, withAlpha } from './outro';
import { TRON_SETTINGS } from './settings';
import { cellsWord, summarizeTron } from './summary';
import { isTronState, speedAt } from './types';

const result = (patch: Record<string, unknown> = {}) => ({
  winner: 'p1',
  reason: 'crash',
  crash: { p1: null, p2: [33, 0] },
  cause: { p1: null, p2: 'wall' },
  lengths: { p1: 112, p2: 21 },
  totalCells: 1120,
  durationMs: 14_000,
  ...patch,
});

describe('summarizeTron', () => {
  it('победа: причина, длина следа и доля арены', () => {
    expect(summarizeTron(result())).toEqual({
      winner: 'p1',
      reason: 'Врезался в стену',
      percent: { p1: 10, p2: 2 },
      label: { p1: 'След: 112 клеток', p2: 'След: 21 клетка' },
    });
  });

  it('причины', () => {
    const reason = (patch: Record<string, unknown>) => summarizeTron(result(patch)).reason;
    expect(reason({ winner: 'p2', cause: { p1: 'trail', p2: null } })).toBe('Врезался в след');
    expect(reason({ cause: undefined })).toBe('Врезался');
    expect(reason({ winner: 'draw', reason: 'both', cause: { p1: 'head', p2: 'head' } })).toBe(
      'Столкновение лоб в лоб',
    );
    expect(reason({ winner: 'draw', reason: 'both', cause: { p1: 'wall', p2: 'trail' } })).toBe(
      'Оба врезались',
    );
    expect(reason({ winner: 'draw', reason: 'timeout' })).toBe('Время вышло');
  });

  it('без totalCells — подпись без полосы', () => {
    const s = summarizeTron(result({ totalCells: undefined, lengths: { p1: 2, p2: 3 } }));
    expect(s.label).toEqual({ p1: 'След: 2 клетки', p2: 'След: 3 клетки' });
    expect(s.percent).toEqual({ p1: null, p2: null });
  });

  it('мусор — без падений', () => {
    expect(summarizeTron(null)).toEqual({
      winner: null,
      reason: null,
      percent: { p1: null, p2: null },
      label: { p1: null, p2: null },
    });
    const s = summarizeTron({ winner: 'team', reason: 'x', lengths: { p1: -1, p2: 1.5 } });
    expect(s.winner).toBeNull();
    expect(s.reason).toBeNull();
    expect(s.label).toEqual({ p1: null, p2: null });
  });

  it('склонение: клетка / клетки / клеток', () => {
    const cases: [number, string][] = [
      [0, 'клеток'],
      [1, 'клетка'],
      [3, 'клетки'],
      [5, 'клеток'],
      [11, 'клеток'],
      [14, 'клеток'],
      [21, 'клетка'],
      [104, 'клетки'],
      [111, 'клеток'],
    ];
    for (const [n, word] of cases) expect(cellsWord(n), String(n)).toBe(word);
  });
});

describe('tron: помощники renderer', () => {
  it('скорость совпадает с core', () => {
    expect(speedAt(true, 0)).toBe(8);
    expect(speedAt(true, 10_000)).toBe(9);
    expect(speedAt(true, 1e9)).toBe(14);
    expect(speedAt(false, 1e9)).toBe(8);
  });

  it('точка удара — на границе клетки по направлению движения', () => {
    expect(impactPoint(39, 14, 'right')).toEqual({ x: 40, y: 14.5 });
    expect(impactPoint(3, 0, 'up')).toEqual({ x: 3.5, y: 0 });
  });

  it('withAlpha', () => {
    expect(withAlpha('#ff5d8f', 0.5)).toBe('rgba(255,93,143,0.5)');
  });

  it('isTronState отсекает мусор', () => {
    expect(isTronState(null)).toBe(false);
    expect(isTronState({ config: { width: 2, height: 2 }, trail: [0], players: {} })).toBe(false);
    expect(
      isTronState({
        config: { width: 1, height: 2 },
        trail: [0, 0],
        players: { p1: {}, p2: {} },
      }),
    ).toBe(true);
  });

  it('настройки: ускорение по умолчанию включено, сквозные края — выключены', () => {
    const [accelerate, wrap] = TRON_SETTINGS;
    expect(accelerate?.isOn({ accelerate: true, wrap: false })).toBe(true);
    expect(accelerate?.isOn({ accelerate: false })).toBe(false);
    expect(accelerate?.patch(false)).toEqual({ accelerate: false });
    expect(wrap?.isOn({ wrap: false })).toBe(false);
    expect(wrap?.isOn({ wrap: true })).toBe(true);
    expect(wrap?.patch(true)).toEqual({ wrap: true });
  });
});
