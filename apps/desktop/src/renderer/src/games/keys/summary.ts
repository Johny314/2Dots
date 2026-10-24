// Итог раунда «Ключа и двери» и форматирование времени.
import { basicSummary, isFiniteNumber, isObject, type RoundSummary } from '../types';

/** Оставшееся время для таймера: «2:59» (секунды вверх — 0:00 только в самом конце). */
export function formatCountdown(ms: number): string {
  return clock(Math.max(0, Math.ceil(ms / 1000)));
}

/** Прошедшее время: «1:24» (целые секунды вниз). */
export function formatElapsed(ms: number): string {
  return clock(Math.max(0, Math.floor(ms / 1000)));
}

function clock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function summarizeKeys(result: unknown): RoundSummary {
  const summary = basicSummary(result);
  const winner = summary.winner === 'team' || summary.winner === 'none' ? summary.winner : null;
  summary.winner = winner;
  if (!isObject(result) || winner === null) return summary;

  const { reason, timeMs, doorsOpened, totalDoors } = result;
  const escaped = reason === 'escaped' || (reason !== 'timeout' && winner === 'team');
  summary.reason = escaped ? 'Вы выбрались' : 'Время вышло';

  const hasDoors =
    isFiniteNumber(doorsOpened) &&
    isFiniteNumber(totalDoors) &&
    totalDoors > 0 &&
    doorsOpened >= 0 &&
    doorsOpened <= totalDoors;
  const doors = hasDoors ? `${doorsOpened}/${totalDoors}` : null;

  if (winner === 'team') {
    const parts = [isFiniteNumber(timeMs) ? `Выбрались за ${formatElapsed(timeMs)}` : 'Выбрались'];
    if (doors) parts.push(`двери ${doors}`);
    summary.teamLabel = parts.join(' · ');
  } else {
    summary.teamLabel = doors ? `Открыто дверей ${doors}` : 'Не успели выбраться';
  }
  return summary;
}
