import type { MiniGame, PlayerId } from '../minigame';

/** Простейшая мини-игра для тестов сети: кто первым наберёт target очков. */
export interface CounterConfig {
  target: number;
}
export interface CounterInput {
  inc: number;
}
export interface CounterState {
  tick: number;
  target: number;
  counts: Record<PlayerId, number>;
}
export interface CounterResult {
  winner: PlayerId;
}

export const counterGame: MiniGame<CounterConfig, CounterState, CounterInput, CounterResult> = {
  id: 'counter',
  title: 'Счётчик (тест)',
  tickHz: 30,
  defaultConfig: () => ({ target: 5 }),
  init: (_seed, _players, config) => ({ tick: 0, target: config.target, counts: { p1: 0, p2: 0 } }),
  parseInput(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const inc = (raw as { inc?: unknown }).inc;
    return typeof inc === 'number' && Number.isInteger(inc) && inc >= 0 && inc <= 1
      ? { inc }
      : null;
  },
  applyInput(state, player, input) {
    state.counts[player] += input.inc;
  },
  tick(state) {
    state.tick++;
  },
  result(state) {
    if (state.counts.p1 >= state.target) return { winner: 'p1' };
    if (state.counts.p2 >= state.target) return { winner: 'p2' };
    return null;
  },
};
