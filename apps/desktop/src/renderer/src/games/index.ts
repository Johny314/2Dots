import { mazeModule } from './maze';
import { tronModule } from './tron';
import { territoryModule } from './territory';
import type { GameModule } from './types';

/** Мини-игры на стороне renderer по gameId (id совпадает с MiniGame.id из core). */
export const GAME_MODULES: Readonly<Record<string, GameModule>> = {
  maze: mazeModule,
  tron: tronModule,
  territory: territoryModule,
};

export function getGameModule(id: string): GameModule | undefined {
  return Object.hasOwn(GAME_MODULES, id) ? GAME_MODULES[id] : undefined;
}
