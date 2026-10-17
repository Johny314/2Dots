import type { MountGameView } from './types';

/** Рендереры мини-игр по gameId. Трек E регистрирует здесь 'maze'. */
export const GAME_VIEWS: Readonly<Record<string, MountGameView>> = {};
