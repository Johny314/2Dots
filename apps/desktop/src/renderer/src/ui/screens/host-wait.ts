import { DEFAULT_PORT, type ServerMsg } from '@2dots/core';
import type { HostInfo } from '../../../../shared/api';
import { dotsLogo, h } from '../dom';
import type { Screen } from '../router';
import { button } from './common';
import { settingsPanel } from './settings';

export interface HostWaitProps {
  info: HostInfo;
  onConfig(patch: Record<string, unknown>): void;
  onCancel(): void;
}

export interface HostWaitScreen extends Screen {
  setStatus(text: string): void;
  /** Лобби своей игры: показываем настройки, пока ждём соперника. */
  updateLobby(lobby: Extract<ServerMsg, { t: 'lobby' }>): void;
}

export function hostWaitScreen(props: HostWaitProps): HostWaitScreen {
  const { ips, port } = props.info;
  const suffix = port === DEFAULT_PORT ? '' : `:${port}`;
  const status = h(
    'p',
    { class: 'status', role: 'status', testid: 'host-status' },
    'Запускаем игру…',
  );
  const settings = settingsPanel({ isHost: true, onChange: props.onConfig });

  const addresses =
    ips.length > 0
      ? h(
          'ul',
          { class: 'ip-list', testid: 'host-ips' },
          ...ips.map((ip) => h('li', { class: 'ip' }, ip + suffix)),
        )
      : h(
          'p',
          { class: 'warning', testid: 'host-ips' },
          'Не нашли адрес в локальной сети. Проверьте, что ноутбук подключён к Wi‑Fi.',
        );

  const el = h(
    'main',
    { class: 'host-wait centered' },
    dotsLogo('md', true),
    h('h2', { class: 'heading' }, 'Ждём второго игрока'),
    h(
      'p',
      { class: 'muted' },
      'На втором ноутбуке нажмите «Присоединиться» и выберите эту игру или введите адрес:',
    ),
    addresses,
    status,
    settings.el,
    h(
      'div',
      { class: 'actions actions-row' },
      button('Отмена', {
        testid: 'host-cancel',
        variant: 'ghost',
        hint: 'Esc',
        onClick: props.onCancel,
      }),
    ),
  );

  return {
    id: 'host-wait',
    el,
    escape: props.onCancel,
    setStatus: (text) => {
      status.textContent = text;
    },
    updateLobby: (lobby) => settings.update(lobby.gameId, lobby.config),
  };
}
