// «Горячо-холодно»: насколько близко соперник по пути в лабиринте (не по прямой).
import { maze as mazeCore, type PlayerId } from '@2dots/core';
import type { maze } from '@2dots/core';

const { pathDistance, startCell } = mazeCore;

/** За какой интервал сравниваем расстояние, чтобы сказать «теплее» / «холоднее». */
const TREND_WINDOW_MS = 800;

export type Trend = 'warmer' | 'colder' | null;

export interface HeatReading {
  /** 0 — холодно (далеко), 1 — горячо (рядом). */
  heat: number;
  /** Расстояние по проходам до соперника, клеток. */
  distance: number;
  trend: Trend;
}

/** Словесная оценка для подписи индикатора. */
export function heatWord(heat: number): string {
  if (heat >= 0.9) return 'Обжигающе!';
  if (heat >= 0.75) return 'Горячо';
  if (heat >= 0.5) return 'Тепло';
  if (heat >= 0.25) return 'Прохладно';
  return 'Холодно';
}

/** Цвет индикатора: синий (холодно) → красный (горячо). */
export function heatColor(heat: number, alpha = 1): string {
  const h = Math.round(220 * (1 - Math.min(1, Math.max(0, heat))));
  return `hsla(${h}, 90%, 60%, ${alpha})`;
}

export class HeatTracker {
  private seed: number | null = null;
  private startDistance = 1;
  private history: { at: number; distance: number }[] = [];

  /** Пересчитывает показания по новому state; now — время получения state (мс). */
  read(state: maze.MazeState, you: PlayerId, now: number): HeatReading {
    if (state.seed !== this.seed) {
      this.seed = state.seed;
      this.history = [];
      const d = pathDistance(state.maze, startCell(state.maze, 'p1'), startCell(state.maze, 'p2'));
      this.startDistance = Math.max(1, d);
    }
    const me = state.players[you];
    const other = state.players[you === 'p1' ? 'p2' : 'p1'];
    const distance = Math.max(0, pathDistance(state.maze, [me.x, me.y], [other.x, other.y]));
    // Нормируем на расстояние между стартами: в начале раунда — «холодно», при встрече — 1.
    const heat = 1 - Math.min(1, distance / this.startDistance);

    this.history.push({ at: now, distance });
    while (
      this.history.length > 1 &&
      now - (this.history[1] as { at: number }).at >= TREND_WINDOW_MS
    ) {
      this.history.shift();
    }
    const oldest = this.history[0] as { at: number; distance: number };
    const trend: Trend =
      now - oldest.at < TREND_WINDOW_MS / 2 || oldest.distance === distance
        ? null
        : distance < oldest.distance
          ? 'warmer'
          : 'colder';
    return { heat, distance, trend };
  }
}
