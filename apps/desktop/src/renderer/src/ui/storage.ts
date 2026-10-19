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

const SETTINGS_KEY = 'twodots.settings';

/** Последние настройки хоста (частичные, как для setConfig); проверяет их сервер. */
export function loadSettings(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function saveSettings(patch: Record<string, unknown>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...patch }));
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
