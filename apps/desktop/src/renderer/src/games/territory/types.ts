// Типы «Территории» для renderer — из core.
import { territory, type PlayerId } from '@2dots/core';

export type TerritoryConfig = territory.TerritoryConfig;
export type TerritoryResult = territory.TerritoryResult;
export type TerritoryState = territory.TerritoryState;

/** Радиус тумана, когда хост его включает. */
export const FOG_RADIUS = territory.DEFAULT_FOG_RADIUS;
export const DEFAULT_TIME_LIMIT_MS = territory.DEFAULT_TIME_LIMIT_MS;
export const LONG_TIME_LIMIT_MS = territory.LONG_TIME_LIMIT_MS;

/** Код владельца → игрок. */
export const ownerId = (code: number | undefined): PlayerId | null =>
  code === undefined ? null : territory.ownerId(code);
