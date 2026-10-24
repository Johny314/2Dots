import { describe, expect, it } from 'vitest';
import { KEYS_SETTINGS } from './settings';
import { formatCountdown, formatElapsed, summarizeKeys } from './summary';

describe('summarizeKeys', () => {
  it('выбрались: время и двери', () => {
    expect(
      summarizeKeys({
        winner: 'team',
        reason: 'escaped',
        timeMs: 84_500,
        doorsOpened: 4,
        totalDoors: 4,
      }),
    ).toEqual({
      winner: 'team',
      reason: 'Вы выбрались',
      percent: { p1: null, p2: null },
      label: { p1: null, p2: null },
      teamLabel: 'Выбрались за 1:24 · двери 4/4',
    });
  });

  it('время вышло: сколько дверей открыто', () => {
    const s = summarizeKeys({
      winner: 'none',
      reason: 'timeout',
      timeMs: 180_000,
      doorsOpened: 2,
      totalDoors: 6,
    });
    expect(s.winner).toBe('none');
    expect(s.reason).toBe('Время вышло');
    expect(s.teamLabel).toBe('Открыто дверей 2/6');
    expect(s.label).toEqual({ p1: null, p2: null });
  });

  it('результат без подробностей (мок) — всё равно общий итог', () => {
    expect(summarizeKeys({ winner: 'team' })).toMatchObject({
      winner: 'team',
      reason: 'Вы выбрались',
      teamLabel: 'Выбрались',
    });
    expect(summarizeKeys({ winner: 'none' })).toMatchObject({
      winner: 'none',
      reason: 'Время вышло',
      teamLabel: 'Не успели выбраться',
    });
  });

  it('без дверей и с мусором в полях', () => {
    expect(
      summarizeKeys({ winner: 'team', reason: 'escaped', timeMs: 5000, totalDoors: 0 }).teamLabel,
    ).toBe('Выбрались за 0:05');
    expect(
      summarizeKeys({ winner: 'none', reason: 'timeout', doorsOpened: 9, totalDoors: 4 }).teamLabel,
    ).toBe('Не успели выбраться');
  });

  it('не кооперативный или битый результат — без общего итога', () => {
    expect(summarizeKeys(null).teamLabel).toBeUndefined();
    expect(summarizeKeys({ winner: 'p1' })).toEqual({
      winner: null,
      reason: null,
      percent: { p1: null, p2: null },
      label: { p1: null, p2: null },
    });
  });
});

describe('время', () => {
  it('таймер округляет вверх, прошедшее — вниз', () => {
    expect(formatCountdown(180_000)).toBe('3:00');
    expect(formatCountdown(179_001)).toBe('3:00');
    expect(formatCountdown(59_000)).toBe('0:59');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatElapsed(84_999)).toBe('1:24');
    expect(formatElapsed(600_000)).toBe('10:00');
    expect(formatElapsed(-1)).toBe('0:00');
  });
});

describe('настройки', () => {
  it('туман и число дверей', () => {
    const [fog, doors] = KEYS_SETTINGS;
    expect(fog?.isOn({ fogRadius: 3 })).toBe(true);
    expect(fog?.isOn({ fogRadius: null })).toBe(false);
    expect(fog?.patch(false)).toEqual({ fogRadius: null });
    expect(fog?.patch(true)).toEqual({ fogRadius: 3 });
    expect(doors?.isOn({ doorsPerPlayer: 2 })).toBe(false);
    expect(doors?.isOn({ doorsPerPlayer: 3 })).toBe(true);
    expect(doors?.patch(true)).toEqual({ doorsPerPlayer: 3 });
    expect(doors?.patch(false)).toEqual({ doorsPerPlayer: 2 });
    expect(fog?.isOn(null)).toBe(false);
  });
});
