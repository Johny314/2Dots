// Разбор результата раунда (приходит из сети как unknown) для экрана результата.
import { PLAYER_IDS, type PlayerId } from '@2dots/core';

export interface RoundSummary {
  winner: PlayerId | 'draw' | null;
  reason: 'met' | 'timeout' | null;
  /** Доля пройденного пути 0..100; null — неизвестно. */
  percent: Record<PlayerId, number | null>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function summarizeResult(result: unknown): RoundSummary {
  const summary: RoundSummary = { winner: null, reason: null, percent: { p1: null, p2: null } };
  if (!isObject(result)) return summary;

  const { winner, reason, scores, pathLength } = result;
  if (winner === 'p1' || winner === 'p2' || winner === 'draw') summary.winner = winner;
  if (reason === 'met' || reason === 'timeout') summary.reason = reason;

  // Лабиринт: scores / pathLength — «прошёл N% пути».
  if (isObject(scores) && isFiniteNumber(pathLength) && pathLength > 0) {
    for (const id of PLAYER_IDS) {
      const score = scores[id];
      if (isFiniteNumber(score) && score >= 0) {
        summary.percent[id] = Math.min(100, Math.round((score / pathLength) * 100));
      }
    }
  }
  return summary;
}
