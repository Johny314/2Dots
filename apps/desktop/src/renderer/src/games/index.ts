import { mazeModule } from './maze';
import { territoryModule } from './territory';
import type { GameModule } from './types';

/** Мини-игры на стороне renderer по gameId (id совпадает с MiniGame.id из core). */
export const GAME_MODULES: Readonly<Record<string, GameModule>> = {
  maze: mazeModule,
  territory: territoryModule,
};

export function getGameModule(id: string): GameModule | undefined {
  return Object.hasOwn(GAME_MODULES, id) ? GAME_MODULES[id] : undefined;
}
