// Итог раунда «Трона» для экрана результата.
import { PLAYER_IDS, type PlayerId } from '@2dots/core';
import { cellsWord } from '../maze/summary';
import { basicSummary, isFiniteNumber, isObject, type RoundSummary } from '../types';

export { cellsWord };

/** Причина конца раунда без имён: экран результата сам пишет, кто победил. */
function reasonText(result: Record<string, unknown>): string | null {
  const { reason, winner, cause } = result;
  if (reason === 'timeout') return 'Время вышло';
  const causes = isObject(cause) ? cause : {};
  if (reason === 'both') {
    return causes.p1 === 'head' || causes.p2 === 'head'
      ? 'Столкновение лоб в лоб'
      : 'Оба врезались';
  }
  if (reason === 'crash') {
    const loser: PlayerId | null = winner === 'p1' ? 'p2' : winner === 'p2' ? 'p1' : null;
    const c = loser ? causes[loser] : null;
    if (c === 'wall') return 'Врезался в стену';
    if (c === 'trail') return 'Врезался в след';
    return 'Врезался';
  }
  return null;
}

export function summarizeTron(result: unknown): RoundSummary {
  const summary = basicSummary(result);
  if (summary.winner === 'team' || summary.winner === 'none') summary.winner = null;
  if (!isObject(result)) return summary;

  summary.reason = reasonText(result);
  const { lengths, totalCells } = result;
  if (!isObject(lengths)) return summary;
  for (const id of PLAYER_IDS) {
    const n = lengths[id];
    if (!isFiniteNumber(n) || n < 0 || !Number.isInteger(n)) continue;
    summary.label[id] = `След: ${n} ${cellsWord(n)}`;
    if (isFiniteNumber(totalCells) && totalCells > 0) {
      summary.percent[id] = Math.min(100, Math.round((n / totalCells) * 100));
    }
  }
  return summary;
}
