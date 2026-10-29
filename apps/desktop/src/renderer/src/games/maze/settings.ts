// Настройки лабиринта в лобби.
import { maze } from '@2dots/core';
import { isObject, type SettingToggle } from '../types';

const cfg = (config: unknown): Partial<maze.MazeConfig> => (isObject(config) ? config : {});

export const MAZE_SETTINGS: readonly SettingToggle[] = [
  {
    key: 'fog',
    title: 'Туман войны',
    description: `Видно только ${maze.DEFAULT_FOG_RADIUS} клетки вокруг себя и уже пройденный путь`,
    isOn: (c) => cfg(c).fogRadius != null,
    patch: (on) => ({ fogRadius: on ? maze.DEFAULT_FOG_RADIUS : null }),
  },
  {
    key: 'hotcold',
    title: 'Горячо-холодно',
    description: 'Ваша точка «пингует»: чем ближе соперник, тем чаще и горячее волны',
    isOn: (c) => cfg(c).hotCold === true,
    patch: (on) => ({ hotCold: on }),
  },
];
