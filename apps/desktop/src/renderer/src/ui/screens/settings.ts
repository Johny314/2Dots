// Панель настроек мини-игры: хост переключает, гость видит, с какими правилами играем.
// Переключатели берутся из GameModule.settings выбранной игры.
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
  const el = h(
    'section',
    { class: 'panel stack settings', testid: 'settings', hidden: true },
    h('h3', { class: 'subheading' }, props.isHost ? 'Настройки' : 'Настройки (выбирает хост)'),
    list,
  );

  function update(gameId: string, config: unknown): void {
    const toggles = getGameModule(gameId)?.settings ?? [];
    if (toggles.length === 0 || config === undefined) {
      el.hidden = true;
      list.replaceChildren();
      return;
    }
    el.hidden = false;
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
