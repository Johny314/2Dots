// Итог раунда «Пряток» для экрана результата.
import { PLAYER_IDS } from '@2dots/core';
import { basicSummary, isFiniteNumber, isObject, type RoundSummary } from '../types';

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function summarizeHide(result: unknown): RoundSummary {
  const summary = basicSummary(result);
  if (summary.winner === 'team' || summary.winner === 'none') summary.winner = null;
  if (!isObject(result)) return summary;

  const { reason, hider, timeMs, headStartMs, timeLimitMs, hintsUsed } = result;
  if (hider !== 'p1' && hider !== 'p2') return summary;
  if (!isFiniteNumber(timeMs) || !isFiniteNumber(headStartMs) || !isFiniteNumber(timeLimitMs)) {
    return summary;
  }
  const found = reason === 'found';
  const searchMs = Math.max(0, timeMs - headStartMs);
  const limitMs = Math.max(1, timeLimitMs - headStartMs);
  summary.reason = found ? `Найден за ${formatClock(searchMs)}` : 'Время вышло — не нашёл';

  // Полоса прячущегося — сколько продержался, искателя — сколько времени осталось в запасе.
  const held = Math.min(100, Math.round((searchMs / limitMs) * 100));
  const hints = isFiniteNumber(hintsUsed) ? hintsUsed : 0;
  for (const id of PLAYER_IDS) {
    if (id === hider) {
      summary.percent[id] = held;
      summary.label[id] =
        `Прятался · ${found ? 'продержался' : 'не найден за'} ${formatClock(searchMs)}`;
    } else {
      summary.percent[id] = found ? 100 - held : 0;
      const hintText = hints > 0 ? ` · подсказок: ${hints}` : '';
      summary.label[id] = found
        ? `Искал · нашёл за ${formatClock(searchMs)}${hintText}`
        : `Искал · не нашёл${hintText}`;
    }
  }
  return summary;
}
