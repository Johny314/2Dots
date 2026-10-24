// Настройки «Территории» в лобби.
import { isObject, type SettingToggle } from '../types';
import {
  DEFAULT_TIME_LIMIT_MS,
  FOG_RADIUS,
  LONG_TIME_LIMIT_MS,
  type TerritoryConfig,
} from './types';

const cfg = (config: unknown): Partial<TerritoryConfig> => (isObject(config) ? config : {});

export const TERRITORY_SETTINGS: readonly SettingToggle[] = [
  {
    key: 'fog',
    title: 'Туман войны',
    description: `Видно ${FOG_RADIUS} клетки вокруг себя и свою территорию; соперник — только рядом`,
    isOn: (c) => cfg(c).fogRadius != null,
    patch: (on) => ({ fogRadius: on ? FOG_RADIUS : null }),
  },
  {
    key: 'long',
    title: 'Длинный раунд',
    description: 'Раунд 2:30 вместо 1:30',
    isOn: (c) => cfg(c).timeLimitMs === LONG_TIME_LIMIT_MS,
    patch: (on) => ({ timeLimitMs: on ? LONG_TIME_LIMIT_MS : DEFAULT_TIME_LIMIT_MS }),
  },
];
