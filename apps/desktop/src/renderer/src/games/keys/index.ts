// «Ключ и дверь» на стороне renderer: Canvas-рендерер, ввод стрелками/WASD, итог, настройки.
import type { GameModule } from '../types';
import { ARROWS, createKeyInput, WASD } from '../maze/input';
import { KeysRenderer } from './renderer';
import { KEYS_SETTINGS } from './settings';
import { summarizeKeys } from './summary';
import type { KeysState } from './types';

export const keysModule: GameModule = {
  mount(canvas, { you, names, onInput }) {
    const renderer = new KeysRenderer(canvas, { you, names });
    // Ввод — как в лабиринте: { dir }.
    const input = createKeyInput({ ...WASD, ...ARROWS }, (dir) => onInput({ dir }));
    return {
      update(state) {
        renderer.update(state as KeysState);
      },
      destroy() {
        input.destroy();
        renderer.destroy();
      },
      outroMs() {
        return renderer.outroRemainingMs();
      },
    };
  },
  summarize: summarizeKeys,
  settings: KEYS_SETTINGS,
};
