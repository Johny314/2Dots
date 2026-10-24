// Настройки «Трона» в лобби.
import { isObject, type SettingToggle } from '../types';

const cfg = (config: unknown): Record<string, unknown> => (isObject(config) ? config : {});

export const TRON_SETTINGS: readonly SettingToggle[] = [
  {
    key: 'accelerate',
    title: 'Ускорение',
    description: 'Каждые 5 секунд мотоциклы едут чуть быстрее',
    isOn: (c) => cfg(c).accelerate !== false,
    patch: (on) => ({ accelerate: on }),
  },
  {
    key: 'wrap',
    title: 'Сквозные края',
    description: 'Уехал за край — появился с противоположной стороны',
    isOn: (c) => cfg(c).wrap === true,
    patch: (on) => ({ wrap: on }),
  },
];
