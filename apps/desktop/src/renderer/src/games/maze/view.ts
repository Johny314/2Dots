// MountGameView для лабиринта (сетевой режим): рендерер + ввод стрелками/WASD.
import type { maze } from '@2dots/core';
import type { MountGameView } from '../types';
import { ARROWS, createKeyInput, WASD } from './input';
import { MazeRenderer } from './renderer';

export const mountMazeView: MountGameView = (canvas, { you, onInput }) => {
  // TODO(phase2): имена игроков — в GameViewOptions их нет, пока «Вы» / «Соперник».
  const labels = you === 'p1' ? { p1: 'Вы', p2: 'Соперник' } : { p1: 'Соперник', p2: 'Вы' };
  const renderer = new MazeRenderer(canvas, { you, labels, fog: true });
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
  };
};
