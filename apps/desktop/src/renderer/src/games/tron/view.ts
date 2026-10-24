// MountGameView для «Трона»: рендерер + повороты стрелками/WASD (только по нажатию).
import type { MountGameView } from '../types';
import { createTurnInput } from './input';
import { TronRenderer } from './renderer';
import { isTronState, type TronInput } from './types';

export const mountTronView: MountGameView = (canvas, { you, names, match, onInput }) => {
  const renderer = new TronRenderer(canvas, { you, names, match });
  const input = createTurnInput((dir) => {
    const msg: TronInput = { dir };
    onInput(msg);
  });
  return {
    update(state) {
      if (isTronState(state)) renderer.update(state);
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
