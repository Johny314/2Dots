// Имя игрока между запусками. localStorage может быть недоступен — тогда просто не запоминаем.
const NAME_KEY = 'twodots.name';
export const NAME_MAX = 24;

export function loadName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').slice(0, NAME_MAX);
  } catch {
    return '';
  }
}

const SETTINGS_PREFIX = 'twodots.settings.';
/** До v0.3.0 настройки хранились одним набором — это были настройки лабиринта. */
const LEGACY_SETTINGS_KEY = 'twodots.settings';
const GAME_KEY = 'twodots.game';

function readObject(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Последние настройки хоста для игры (частичные, как для setConfig); проверяет их сервер. */
export function loadSettings(gameId: string): Record<string, unknown> | null {
  return (
    readObject(SETTINGS_PREFIX + gameId) ??
    (gameId === 'maze' ? readObject(LEGACY_SETTINGS_KEY) : null)
  );
}

export function saveSettings(gameId: string, patch: Record<string, unknown>): void {
  try {
    localStorage.setItem(
      SETTINGS_PREFIX + gameId,
      JSON.stringify({ ...loadSettings(gameId), ...patch }),
    );
  } catch {
    // нет хранилища — не страшно
  }
}

/** Мини-игра, которую хост выбирал последней. */
export function loadLastGame(): string | null {
  try {
    return localStorage.getItem(GAME_KEY);
  } catch {
    return null;
  }
}

export function saveLastGame(gameId: string): void {
  try {
    localStorage.setItem(GAME_KEY, gameId);
  } catch {
    // нет хранилища — не страшно
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, NAME_MAX));
  } catch {
    // нет хранилища — не страшно
  }
}
