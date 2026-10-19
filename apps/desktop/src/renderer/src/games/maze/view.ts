// MountGameView для лабиринта (сетевой режим): рендерер + ввод стрелками/WASD.
import type { maze } from '@2dots/core';
import type { MountGameView } from '../types';
import { ARROWS, createKeyInput, WASD } from './input';
import { MazeRenderer } from './renderer';

export const mountMazeView: MountGameView = (canvas, { you, names, match, onInput }) => {
  const renderer = new MazeRenderer(canvas, { you, names, match, fog: true });
  const input = createKeyInput({ ...WASD, ...ARROWS }, (dir) => {
    const msg: maze.MazeInput = { dir };
    onInput(msg);
  });
  return {
    update(state) {
      renderer.update(state as maze.MazeState);
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
