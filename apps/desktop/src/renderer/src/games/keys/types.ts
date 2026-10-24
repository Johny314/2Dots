// Типы «Ключа и двери» для renderer — из core (state приходит из сети как unknown).
import { keys } from '@2dots/core';

export type KeysConfig = keys.KeysConfig;
export type Door = keys.Door;
export type KeysResult = keys.KeysResult;
export type KeysState = keys.KeysState;

/** Радиус тумана при включённой настройке. */
export const KEYS_FOG_RADIUS = keys.DEFAULT_FOG_RADIUS;
