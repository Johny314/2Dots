// Типы «Трона» для renderer — из core; данные из сети считаются непроверенными (isTronState).
import { maze, tron } from '@2dots/core';

export type Dir = tron.Dir;
export type TronInput = tron.TronInput;
export type TronPlayerView = tron.TronPlayer;
export type TronResultView = tron.TronResult;
export type TronStateView = tron.TronState;

export const DELTA = maze.DELTA;

/** Скорость (клеток/с) в момент elapsedMs — как в core. */
export const speedAt = (accelerate: boolean, elapsedMs: number): number =>
  tron.speedAt({ accelerate }, elapsedMs);

/** Минимальная проверка state из сети: достаточно для отрисовки без падений. */
export function isTronState(v: unknown): v is TronStateView {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<TronStateView>;
  return (
    typeof s.config === 'object' &&
    s.config !== null &&
    Array.isArray(s.trail) &&
    s.trail.length === s.config.width * s.config.height &&
    typeof s.players === 'object' &&
    s.players !== null &&
    typeof s.players.p1 === 'object' &&
    typeof s.players.p2 === 'object'
  );
}
