import { keysModule } from './keys';
import { mazeModule } from './maze';
import { territoryModule } from './territory';
import { tronModule } from './tron';
import type { GameModule } from './types';

/** Мини-игры на стороне renderer по gameId (id совпадает с MiniGame.id из core). */
export const GAME_MODULES: Readonly<Record<string, GameModule>> = {
  maze: mazeModule,
  territory: territoryModule,
  tron: tronModule,
  keys: keysModule,
};

export function getGameModule(id: string): GameModule | undefined {
  return Object.hasOwn(GAME_MODULES, id) ? GAME_MODULES[id] : undefined;
}
