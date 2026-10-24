import type { GameModule } from '../types';
import { MAZE_SETTINGS } from './settings';
import { summarizeMaze } from './summary';
import { mountMazeView } from './view';

export const mazeModule: GameModule = {
  mount: mountMazeView,
  summarize: summarizeMaze,
  settings: MAZE_SETTINGS,
};
