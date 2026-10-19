// Панель настроек мини-игры: хост переключает, гость видит, с какими правилами играем.
import { maze } from '@2dots/core';
import { h } from '../dom';

export interface SettingsPanelProps {
  isHost: boolean;
  /** Частичные настройки для GameClient.setConfig. */
  onChange(patch: Record<string, unknown>): void;
}

export interface SettingsPanel {
  el: HTMLElement;
  /** Новые настройки из лобби. Для игр без настроек панель скрывается. */
  update(gameId: string, config: unknown): void;
}

interface Toggle {
  key: string;
  title: string;
  description: string;
  /** Включён ли переключатель при данных настройках. */
  isOn(config: maze.MazeConfig): boolean;
  /** Что отправить хосту при переключении в on. */
  patch(on: boolean): Record<string, unknown>;
}

const MAZE_TOGGLES: Toggle[] = [
  {
    key: 'fog',
    title: 'Туман войны',
    description: `Видно только ${maze.DEFAULT_FOG_RADIUS} клетки вокруг себя и уже пройденный путь`,
    isOn: (c) => c.fogRadius !== null,
    patch: (on) => ({ fogRadius: on ? maze.DEFAULT_FOG_RADIUS : null }),
  },
  {
    key: 'hotcold',
    title: 'Горячо-холодно',
    description: 'Шкала и цвет экрана подсказывают, насколько близко соперник',
    isOn: (c) => c.hotCold,
    patch: (on) => ({ hotCold: on }),
  },
];

function isMazeConfig(config: unknown): config is maze.MazeConfig {
  return typeof config === 'object' && config !== null && 'fogRadius' in config;
}

export function settingsPanel(props: SettingsPanelProps): SettingsPanel {
  const list = h('div', { class: 'settings-list' });
  const el = h(
    'section',
    { class: 'panel stack settings', testid: 'settings', hidden: true },
    h('h3', { class: 'subheading' }, props.isHost ? 'Настройки' : 'Настройки (выбирает хост)'),
    list,
  );

  function update(gameId: string, config: unknown): void {
    if (gameId !== maze.mazeGame.id || !isMazeConfig(config)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.testid;
    list.replaceChildren(
      ...MAZE_TOGGLES.map((t) => {
        const on = t.isOn(config);
        const titleId = `setting-${t.key}-title`;
        const sw = h(
          'button',
          {
            type: 'button',
            role: 'switch',
            class: `toggle${on ? ' on' : ''}`,
            'aria-checked': on ? 'true' : 'false',
            'aria-labelledby': titleId,
            testid: `setting-${t.key}`,
            disabled: !props.isHost,
          },
          h('span', { class: 'toggle-knob', 'aria-hidden': 'true' }),
        );
        sw.addEventListener('click', () => {
          if (props.isHost) props.onChange(t.patch(!on));
        });
        return h(
          'label',
          { class: `setting${props.isHost ? '' : ' readonly'}` },
          h(
            'span',
            { class: 'setting-text' },
            h('span', { class: 'setting-title', id: titleId }, t.title),
            h('span', { class: 'setting-desc muted small' }, t.description),
          ),
          sw,
        );
      }),
    );
    // Перерисовка не должна терять фокус с переключателя.
    if (focused?.startsWith('setting-')) {
      el.querySelector<HTMLElement>(`[data-testid="${focused}"]`)?.focus();
    }
  }

  return { el, update };
}
