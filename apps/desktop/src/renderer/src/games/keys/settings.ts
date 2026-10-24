// Настройки «Ключа и двери» в лобби.
import { isObject, type SettingToggle } from '../types';
import { KEYS_FOG_RADIUS, type KeysConfig } from './types';

const cfg = (config: unknown): Partial<KeysConfig> => (isObject(config) ? config : {});

export const KEYS_SETTINGS: readonly SettingToggle[] = [
  {
    key: 'fog',
    title: 'Туман войны',
    description: `Видно ${KEYS_FOG_RADIUS} клетки вокруг — рассказывайте друг другу, что видите`,
    isOn: (c) => cfg(c).fogRadius != null,
    patch: (on) => ({ fogRadius: on ? KEYS_FOG_RADIUS : null }),
  },
  {
    key: 'doors',
    title: 'Больше дверей',
    description: 'По 3 двери на пути каждого вместо 2',
    isOn: (c) => cfg(c).doorsPerPlayer === 3,
    patch: (on) => ({ doorsPerPlayer: on ? 3 : 2 }),
  },
];
