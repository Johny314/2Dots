// MountGameView для «Трона»: рендерер + повороты стрелками/WASD.
import type { MountGameView } from '../types';
import { ARROWS, createKeyInput, WASD } from '../maze/input';
import { TronRenderer } from './renderer';
import { isTronState, type TronInput } from './types';

export const mountTronView: MountGameView = (canvas, { you, names, match, onInput }) => {
  const renderer = new TronRenderer(canvas, { you, names, match });
  // null (клавиши отпущены) core игнорирует: мотоцикл едет, пока не повернёшь.
  const input = createKeyInput({ ...WASD, ...ARROWS }, (dir) => {
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
