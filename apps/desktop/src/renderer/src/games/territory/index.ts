// «Территория» на стороне renderer: рендерер + ввод стрелками/WASD, итог, настройки.
import { ARROWS, createKeyInput, WASD } from '../maze/input';
import type { GameModule, MountGameView } from '../types';
import { TerritoryRenderer } from './renderer';
import { TERRITORY_SETTINGS } from './settings';
import { summarizeTerritory } from './summary';
import type { TerritoryState } from './types';

export const mountTerritoryView: MountGameView = (canvas, { you, names, match, onInput }) => {
  const renderer = new TerritoryRenderer(canvas, { you, names, match });
  // Ввод тот же, что у лабиринта: { dir }.
  const input = createKeyInput({ ...WASD, ...ARROWS }, (dir) => onInput({ dir }));
  return {
    update(state) {
      renderer.update(state as TerritoryState);
    },
    destroy() {
      input.destroy();
      renderer.destroy();
    },
    outroMs() {
      return renderer.outroRemainingMs();
    },
  };
};

export const territoryModule: GameModule = {
  mount: mountTerritoryView,
  summarize: summarizeTerritory,
  settings: TERRITORY_SETTINGS,
};
