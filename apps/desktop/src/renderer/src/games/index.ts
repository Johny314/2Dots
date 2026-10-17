import { mountMazeView } from './maze/view';
import type { MountGameView } from './types';

/** Рендереры мини-игр по gameId. */
export const GAME_VIEWS: Readonly<Record<string, MountGameView>> = {
  maze: mountMazeView,
};
