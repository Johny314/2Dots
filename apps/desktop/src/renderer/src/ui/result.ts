// Разбор результата раунда (приходит из сети как unknown) для экрана результата.
import { PLAYER_IDS, type PlayerId } from '@2dots/core';

export interface RoundSummary {
  winner: PlayerId | 'draw' | null;
  reason: 'met' | 'timeout' | null;
  /** Заполнение полосы 0..100; null — неизвестно. */
  percent: Record<PlayerId, number | null>;
  /** Подпись счёта («42 клетки · 13% лабиринта»); null — неизвестно. */
  label: Record<PlayerId, string | null>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 1 клетка, 2 клетки, 5 клеток. */
export function cellsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'клетка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'клетки';
  return 'клеток';
}

export function summarizeResult(result: unknown): RoundSummary {
  const summary: RoundSummary = {
    winner: null,
    reason: null,
    percent: { p1: null, p2: null },
    label: { p1: null, p2: null },
  };
  if (!isObject(result)) return summary;

  const { winner, reason, scores, pathLength, scoring, totalCells } = result;
  if (winner === 'p1' || winner === 'p2' || winner === 'draw') summary.winner = winner;
  if (reason === 'met' || reason === 'timeout') summary.reason = reason;
  if (!isObject(scores)) return summary;

  for (const id of PLAYER_IDS) {
    const score = scores[id];
    if (!isFiniteNumber(score) || score < 0) continue;
    if (scoring === 'distinct' && isFiniteNumber(totalCells) && totalCells > 0) {
      // Лабиринт, уникальные клетки: «N клеток · X% лабиринта».
      const pct = Math.min(100, Math.round((score / totalCells) * 100));
      summary.percent[id] = pct;
      summary.label[id] = `${score} ${cellsWord(score)} · ${pct}% лабиринта`;
    } else if (isFiniteNumber(pathLength) && pathLength > 0) {
      // Лабиринт, продвижение по пути (bfs): «прошёл N% пути».
      const pct = Math.min(100, Math.round((score / pathLength) * 100));
      summary.percent[id] = pct;
      summary.label[id] = `${pct}% пути`;
    }
  }
  return summary;
}
