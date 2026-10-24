export type PlayerId = 'p1' | 'p2';

/** p1 — всегда хост, p2 — присоединившийся. */
export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

/**
 * Мини-игра — чистая детерминированная логика без DOM/Node/времени.
 * Сервер владеет State, применяет ввод и тикает с фиксированным dt = 1000 / tickHz.
 * State и Result обязаны быть JSON-сериализуемыми: сервер рассылает State целиком.
 */
export interface MiniGame<Config, State, Input, Result> {
  readonly id: string;
  readonly title: string;
  /** Одна строка для выбора игры в лобби. */
  readonly description: string;
  /**
   * versus — друг против друга: result.winner = 'p1' | 'p2' | 'draw', победа даёт очко матча.
   * coop — вместе: result.winner = 'team' (справились) | 'none' (нет); счёт матча не ведётся.
   */
  readonly kind: 'versus' | 'coop';
  readonly tickHz: number;
  defaultConfig(): Config;
  init(seed: number, players: readonly PlayerId[], config: Config): State;
  /**
   * Настройки, которые хост меняет в лобби: накладывает безопасную часть raw на base.
   * Поля, которые хосту менять нельзя, берутся из base. null — настройки отклонены.
   */
  parseConfig(raw: unknown, base: Config): Config | null;
  /** Проверяет произвольный ввод из сети. null — ввод отклонён. */
  parseInput(raw: unknown): Input | null;
  /** Мутирует state. */
  applyInput(state: State, player: PlayerId, input: Input): void;
  /** Мутирует state. */
  tick(state: State, dtMs: number): void;
  /** null — игра идёт. */
  result(state: State): Result | null;
}

/** Любая мини-игра из реестра (параметры методов бивариантны). */
export type AnyMiniGame = MiniGame<unknown, unknown, unknown, unknown>;
