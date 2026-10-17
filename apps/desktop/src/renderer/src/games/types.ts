// Контракт рендерера мини-игры. Каждая мини-игра в renderer реализует MountGameView.
import type { PlayerId } from '@2dots/core';

export interface GameViewOptions {
  /** Какой игрок сидит за этим экраном. */
  you: PlayerId;
  /** Вызывается при изменении ввода; значение уходит в GameClient.sendInput. */
  onInput(input: unknown): void;
}

export interface GameView {
  /** Новый state от сервера (state целиком, см. ARCHITECTURE.md). */
  update(state: unknown): void;
  /** Снять обработчики клавиатуры, остановить requestAnimationFrame. */
  destroy(): void;
}

export type MountGameView = (canvas: HTMLCanvasElement, options: GameViewOptions) => GameView;
