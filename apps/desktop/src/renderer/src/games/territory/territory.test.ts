import { describe, expect, it } from 'vitest';
import { getGame } from '@2dots/core';
import {
  countUp,
  flash,
  fogLift,
  formatTime,
  OUTRO_MS,
  outroCounts,
  outroProgress,
  p1Share,
  PAINT_POP_MS,
  paintPop,
  sweep,
  timerStyle,
} from './anim';
import { TERRITORY_SETTINGS } from './settings';
import { summarizeTerritory } from './summary';
import type { TerritoryState } from './types';

describe('summarizeTerritory', () => {
  it('клетки и % лабиринта, причина «Время вышло»', () => {
    expect(
      summarizeTerritory({
        winner: 'p2',
        reason: 'timeout',
        scores: { p1: 101, p2: 152 },
        totalCells: 315,
      }),
    ).toEqual({
      winner: 'p2',
      reason: 'Время вышло',
      percent: { p1: 32, p2: 48 },
      label: { p1: '101 клетка · 32% лабиринта', p2: '152 клетки · 48% лабиринта' },
    });
    const draw = summarizeTerritory({
      winner: 'draw',
      reason: 'timeout',
      scores: { p1: 5, p2: 5 },
      totalCells: 315,
    });
    expect(draw.winner).toBe('draw');
    expect(draw.label.p1).toBe('5 клеток · 2% лабиринта');
  });

  it('мусор и результат без счёта (мок) — без падений', () => {
    expect(summarizeTerritory({ winner: 'p1' })).toEqual({
      winner: 'p1',
      reason: null,
      percent: { p1: null, p2: null },
      label: { p1: null, p2: null },
    });
    expect(summarizeTerritory(null).winner).toBeNull();
    expect(summarizeTerritory({ winner: 'team' }).winner).toBeNull();
    const bad = summarizeTerritory({
      winner: 'p1',
      reason: 'timeout',
      scores: { p1: -1, p2: 'x' },
      totalCells: 0,
    });
    expect(bad.percent).toEqual({ p1: null, p2: null });
    const partial = summarizeTerritory({ scores: { p1: 400, p2: 2.5 }, totalCells: 315 });
    expect(partial.percent).toEqual({ p1: 100, p2: null });
  });

  it('итог настоящей игры из core', () => {
    const game = getGame('territory');
    expect(game).toBeDefined();
    if (!game) return;
    const config = { ...(game.defaultConfig() as object), timeLimitMs: 60_000 };
    const s = game.init(3, ['p1', 'p2'], config) as TerritoryState;
    for (let i = 0; i < 1900 && !game.result(s); i++) game.tick(s, 1000 / 30);
    const summary = summarizeTerritory(game.result(s));
    expect(summary).toEqual({
      winner: 'draw',
      reason: 'Время вышло',
      percent: { p1: 0, p2: 0 },
      label: { p1: '1 клетка · 0% лабиринта', p2: '1 клетка · 0% лабиринта' },
    });
  });
});

describe('настройки', () => {
  const byKey = (key: string) => TERRITORY_SETTINGS.find((t) => t.key === key);

  it('туман: 3 ↔ null', () => {
    const fog = byKey('fog');
    expect(fog?.isOn({ fogRadius: null })).toBe(false);
    expect(fog?.isOn({ fogRadius: 3 })).toBe(true);
    expect(fog?.patch(true)).toEqual({ fogRadius: 3 });
    expect(fog?.patch(false)).toEqual({ fogRadius: null });
  });

  it('длинный раунд: 150 с ↔ 90 с, патчи принимает core', () => {
    const long = byKey('long');
    expect(long?.isOn({ timeLimitMs: 90_000 })).toBe(false);
    expect(long?.isOn({ timeLimitMs: 150_000 })).toBe(true);
    expect(long?.isOn(null)).toBe(false);
    const game = getGame('territory');
    const base = game?.defaultConfig();
    for (const t of TERRITORY_SETTINGS) {
      for (const on of [true, false]) {
        const next = game?.parseConfig(t.patch(on), base);
        expect(next, `${t.key} ${on}`).not.toBeNull();
        expect(t.isOn(next)).toBe(on);
      }
    }
  });
});

describe('анимации и HUD', () => {
  it('таймер и доля шкалы', () => {
    expect(formatTime(90_000)).toBe('1:30');
    expect(formatTime(9_001)).toBe('0:10');
    expect(formatTime(-5)).toBe('0:00');
    expect(p1Share({ p1: 0, p2: 0 })).toBe(0.5);
    expect(p1Share({ p1: 30, p2: 10 })).toBe(0.75);
  });

  it('таймер краснеет и пульсирует только в последние 10 с', () => {
    expect(timerStyle(30_000)).toEqual({ danger: false, scale: 1 });
    expect(timerStyle(10_001).danger).toBe(false);
    expect(timerStyle(10_000).danger).toBe(true);
    expect(timerStyle(8_999).scale).toBeGreaterThan(1.1); // только что сменилась цифра
    expect(timerStyle(8_100).scale).toBeLessThan(1.01);
    expect(timerStyle(0)).toEqual({ danger: true, scale: 1 });
  });

  it('свежая краска затухает', () => {
    expect(paintPop(0)).toBe(1);
    expect(paintPop(PAINT_POP_MS / 2)).toBeCloseTo(0.5);
    expect(paintPop(PAINT_POP_MS)).toBe(0);
    expect(paintPop(-1)).toBe(0);
  });

  it('финал: туман рассеивается, вспышки, досчёт, волна', () => {
    expect(outroProgress(1000, 1000)).toBe(0);
    expect(outroProgress(1000, 1000 + OUTRO_MS / 2)).toBeCloseTo(0.5);
    expect(outroProgress(1000, 1000 + OUTRO_MS * 2)).toBe(1);
    expect(fogLift(0)).toBe(0);
    expect(fogLift(0.5)).toBe(1);
    expect(flash(0)).toBe(0);
    expect(Math.max(...[0.15, 0.2, 0.25].map(flash))).toBeGreaterThan(0.9);
    expect(flash(0.9)).toBe(0);
    expect(countUp(0)).toBe(0);
    expect(countUp(1)).toBe(1);
    expect(outroCounts({ p1: 120, p2: 80 }, 1)).toEqual({ p1: 120, p2: 80 });
    expect(outroCounts({ p1: 120, p2: 80 }, 0)).toEqual({ p1: 0, p2: 0 });
    expect(sweep(0.2)).toBe(-1);
    expect(sweep(0.45)).toBe(0);
    expect(sweep(1)).toBe(1);
  });
});
