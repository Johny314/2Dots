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

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, NAME_MAX));
  } catch {
    // нет хранилища — не страшно
  }
}
