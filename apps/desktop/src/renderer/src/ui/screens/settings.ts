// Настройки выбранной мини-игры — блок под выбором игры в лобби: хост переключает,
// гость видит, с какими правилами играем. Переключатели — из GameModule.settings.
import { getGame } from '@2dots/core';
import { getGameModule } from '../../games';
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

export function settingsPanel(props: SettingsPanelProps): SettingsPanel {
  const list = h('div', { class: 'settings-list' });
  const title = h('h4', { class: 'settings-title' });
  const el = h('div', { class: 'settings', testid: 'settings', hidden: true }, title, list);

  function update(gameId: string, config: unknown): void {
    const toggles = getGameModule(gameId)?.settings ?? [];
    if (toggles.length === 0 || config === undefined) {
      el.hidden = true;
      list.replaceChildren();
      return;
    }
    el.hidden = false;
    const name = getGame(gameId)?.title ?? gameId;
    title.textContent = props.isHost ? `Настройки: ${name}` : `Настройки: ${name} (выбирает хост)`;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.testid;
    list.replaceChildren(
      ...toggles.map((t) => {
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
