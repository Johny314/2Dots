// Контракт мини-игры на стороне renderer: отрисовка, итог раунда и настройки в лобби.
// Каждая мини-игра регистрирует GameModule в games/index.ts.
import type { PlayerId } from '@2dots/core';

export interface GameViewOptions {
  /** Какой игрок сидит за этим экраном. */
  you: PlayerId;
  /** Имена игроков из лобби. */
  names: Record<PlayerId, string>;
  /** Счёт текущего матча (побед в раундах) на момент старта раунда. */
  match: Record<PlayerId, number>;
  /** Вызывается при изменении ввода; значение уходит в GameClient.sendInput. */
  onInput(input: unknown): void;
}

export interface GameView {
  /** Новый state от сервера (state целиком, см. ARCHITECTURE.md). */
  update(state: unknown): void;
  /** Снять обработчики клавиатуры, остановить requestAnimationFrame. */
  destroy(): void;
  /**
   * Сколько ещё мс доигрывать финальную анимацию раунда (встреча и т. п.).
   * Экран результата показывается после неё. Нет метода — сразу.
   */
  outroMs?(): number;
}

export type MountGameView = (canvas: HTMLCanvasElement, options: GameViewOptions) => GameView;

/** Итог раунда для экрана результата (result приходит из сети как unknown). */
export interface RoundSummary {
  /** team / none — кооператив: справились / нет. */
  winner: PlayerId | 'draw' | 'team' | 'none' | null;
  /** Подпись причины: «Вы встретились», «Время вышло»… */
  reason: string | null;
  /** Полоса у строки игрока, 0..100; null — без полосы. */
  percent: Record<PlayerId, number | null>;
  /** Счёт игрока («42 клетки · 13% лабиринта»); null — неизвестно. */
  label: Record<PlayerId, string | null>;
  /** Кооператив: общий итог вместо строк по игрокам («Выбрались за 1:24»). */
  teamLabel?: string | null;
}

/** Переключатель в панели настроек лобби (меняет хост, гость видит). */
export interface SettingToggle {
  key: string;
  title: string;
  description: string;
  /** Включён ли при данных настройках игры (config из lobby). */
  isOn(config: unknown): boolean;
  /** Частичные настройки для GameClient.setConfig при переключении. */
  patch(on: boolean): Record<string, unknown>;
}

export interface GameModule {
  mount: MountGameView;
  summarize(result: unknown): RoundSummary;
  /** Нет или пусто — панель настроек для игры не показывается. */
  settings?: readonly SettingToggle[];
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;
export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Итог по умолчанию: только победитель (для игр без своего summarize). */
export function basicSummary(result: unknown): RoundSummary {
  const summary: RoundSummary = {
    winner: null,
    reason: null,
    percent: { p1: null, p2: null },
    label: { p1: null, p2: null },
  };
  if (!isObject(result)) return summary;
  const w = result.winner;
  if (w === 'p1' || w === 'p2' || w === 'draw' || w === 'team' || w === 'none') summary.winner = w;
  return summary;
}
