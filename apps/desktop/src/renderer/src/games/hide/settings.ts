// Настройки «Пряток» в лобби: роли и «Горячо-холодно» (туман — всегда).
import type { hide } from '@2dots/core';
import { isObject, type SettingToggle } from '../types';

const cfg = (config: unknown): Partial<hide.HideConfig> => (isObject(config) ? config : {});

export const HIDE_SETTINGS: readonly SettingToggle[] = [
  {
    key: 'random-roles',
    title: 'Случайные роли',
    description: 'Кто прячется, а кто ищет, решает жребий перед каждым раундом',
    isOn: (c) => (cfg(c).roles ?? 'random') === 'random',
    patch: (on) => ({ roles: on ? 'random' : 'p1' }),
  },
  {
    key: 'host-hides',
    title: 'Хост прячется',
    description: 'Выключено — хост ищет, гость прячется',
    isOn: (c) => cfg(c).roles === 'p1',
    patch: (on) => ({ roles: on ? 'p1' : 'p2' }),
    visible: (c) => (cfg(c).roles ?? 'random') !== 'random',
  },
  {
    key: 'hotcold',
    title: 'Горячо-холодно',
    description: 'Ваша точка «пингует»: чем ближе соперник, тем чаще и горячее волны',
    isOn: (c) => cfg(c).hotCold === true,
    patch: (on) => ({ hotCold: on }),
  },
];
