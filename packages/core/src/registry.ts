import { keysGame } from './games/keys';
import { mazeGame } from './games/maze';
import { territoryGame } from './games/territory';
import { tronGame } from './games/tron';
import type { AnyMiniGame } from './minigame';

/** Реестр мини-игр, доступных в лобби (в этом порядке). Новая игра регистрируется здесь. */
export const GAMES: Readonly<Record<string, AnyMiniGame>> = {
  [mazeGame.id]: mazeGame as AnyMiniGame,
  [territoryGame.id]: territoryGame as AnyMiniGame,
  [tronGame.id]: tronGame as AnyMiniGame,
  [keysGame.id]: keysGame as AnyMiniGame,
};

export const DEFAULT_GAME_ID = mazeGame.id;

export function getGame(id: string): AnyMiniGame | undefined {
  return Object.hasOwn(GAMES, id) ? GAMES[id] : undefined;
}
