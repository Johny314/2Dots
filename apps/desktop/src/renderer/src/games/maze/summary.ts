// Итог раунда лабиринта для экрана результата.
import { PLAYER_IDS } from '@2dots/core';
import { basicSummary, isFiniteNumber, isObject, type RoundSummary } from '../types';

/** 1 клетка, 2 клетки, 5 клеток. */
export function cellsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'клетка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'клетки';
  return 'клеток';
}

export function summarizeMaze(result: unknown): RoundSummary {
  const summary = basicSummary(result);
  if (summary.winner === 'team' || summary.winner === 'none') summary.winner = null;
  if (!isObject(result)) return summary;

  const { reason, scores, pathLength, scoring, totalCells } = result;
  summary.reason =
    reason === 'met' ? 'Вы встретились' : reason === 'timeout' ? 'Время вышло' : null;
  if (!isObject(scores)) return summary;

  for (const id of PLAYER_IDS) {
    const score = scores[id];
    if (!isFiniteNumber(score) || score < 0) continue;
    if (scoring === 'distinct' && isFiniteNumber(totalCells) && totalCells > 0) {
      // Уникальные клетки: «N клеток · X% лабиринта».
      const pct = Math.min(100, Math.round((score / totalCells) * 100));
      summary.percent[id] = pct;
      summary.label[id] = `${score} ${cellsWord(score)} · ${pct}% лабиринта`;
    } else if (isFiniteNumber(pathLength) && pathLength > 0) {
      // Продвижение по пути (bfs): «прошёл N% пути».
      const pct = Math.min(100, Math.round((score / pathLength) * 100));
      summary.percent[id] = pct;
      summary.label[id] = `${pct}% пути`;
    }
  }
  return summary;
}
