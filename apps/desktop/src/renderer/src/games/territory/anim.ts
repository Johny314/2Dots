// Чистые помощники анимаций и HUD «Территории» (без DOM — покрыты unit-тестами).
import type { PlayerId } from '@2dots/core';

/** Длительность финальной анимации раунда. */
export const OUTRO_MS = 1600;
/** «Свежая краска»: сколько длится вспышка клетки, сменившей владельца. */
export const PAINT_POP_MS = 420;
/** Последние секунды раунда: таймер краснеет и пульсирует. */
export const TIMER_DANGER_MS = 10_000;

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Доля p1 среди закрашенных клеток, 0..1 (никто ничего не закрасил — поровну). */
export function p1Share(counts: Record<PlayerId, number>): number {
  const total = counts.p1 + counts.p2;
  return total > 0 ? counts.p1 / total : 0.5;
}

/** Таймер: красный и пульсирует в последние 10 с; scale — множитель размера шрифта. */
export function timerStyle(remainingMs: number): { danger: boolean; scale: number } {
  if (remainingMs > TIMER_DANGER_MS || remainingMs <= 0) {
    return { danger: remainingMs <= TIMER_DANGER_MS, scale: 1 };
  }
  // Пульс раз в секунду, синхронно со сменой цифры.
  const phase = (remainingMs % 1000) / 1000;
  return { danger: true, scale: 1 + 0.18 * phase ** 3 };
}

/** «Свежая краска»: 1 — только что перекрашена, 0 — вспышка закончилась. */
export function paintPop(ageMs: number): number {
  if (ageMs < 0 || ageMs >= PAINT_POP_MS) return 0;
  return 1 - ageMs / PAINT_POP_MS;
}

// ---------- финал раунда (k — прогресс 0..1) ----------

export function outroProgress(startedAt: number, now: number): number {
  return clamp01((now - startedAt) / OUTRO_MS);
}

/** Насколько рассеялся туман: 0 — как был, 1 — нет тумана. */
export const fogLift = (k: number): number => easeOutCubic(k / 0.4);

/** Вспышки территорий: две волны яркости в первой половине, 0..1. */
export function flash(k: number): number {
  const t = (k - 0.08) / 0.5;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI * 2) ** 2;
}

/** Числа у шкалы досчитывают до итоговых: доля от итога, 0..1. */
export const countUp = (k: number): number => easeOutCubic(k / 0.6);

/** Цвет победителя пробегает по полю слева направо: положение волны 0..1 (−1 — ещё нет). */
export function sweep(k: number): number {
  const t = (k - 0.45) / 0.45;
  return t < 0 ? -1 : clamp01(t);
}

/** Шкала на финале: числа досчитывают от 0 до итога. */
export function outroCounts(final: Record<PlayerId, number>, k: number): Record<PlayerId, number> {
  const f = countUp(k);
  return { p1: Math.round(final.p1 * f), p2: Math.round(final.p2 * f) };
}
