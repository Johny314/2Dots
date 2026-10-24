// Итог раунда «Территории» для экрана результата.
import { PLAYER_IDS } from '@2dots/core';
import { cellsWord } from '../maze/summary';
import { basicSummary, isFiniteNumber, isObject, type RoundSummary } from '../types';

export function summarizeTerritory(result: unknown): RoundSummary {
  const summary = basicSummary(result);
  if (summary.winner === 'team' || summary.winner === 'none') summary.winner = null;
  if (!isObject(result)) return summary;

  const { reason, scores, totalCells } = result;
  if (reason === 'timeout') summary.reason = 'Время вышло';
  if (!isObject(scores) || !isFiniteNumber(totalCells) || totalCells <= 0) return summary;

  for (const id of PLAYER_IDS) {
    const score = scores[id];
    if (!isFiniteNumber(score) || score < 0 || !Number.isInteger(score)) continue;
    const pct = Math.min(100, Math.round((score / totalCells) * 100));
    summary.percent[id] = pct;
    summary.label[id] = `${score} ${cellsWord(score)} · ${pct}% лабиринта`;
  }
  return summary;
}
