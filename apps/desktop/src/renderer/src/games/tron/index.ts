import type { GameModule } from '../types';
import { TRON_SETTINGS } from './settings';
import { summarizeTron } from './summary';
import { mountTronView } from './view';

export const tronModule: GameModule = {
  mount: mountTronView,
  summarize: summarizeTron,
  settings: TRON_SETTINGS,
};
