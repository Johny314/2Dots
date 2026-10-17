import { DEFAULT_PORT } from '@2dots/core';
import type { DiscoveredHost } from '../../../../shared/api';
import { errorMessage, h } from '../dom';
import type { Screen } from '../router';
import { button } from './common';

export interface JoinProps {
  discover(): Promise<DiscoveredHost[]>;
  onConnect(host: string, port: number): void;
  onBack(): void;
}

export interface JoinScreen extends Screen {
  /** Идёт подключение: блокируем ввод, показываем статус. */
  setBusy(text: string | null): void;
  setError(text: string): void;
}

/** «192.168.1.5» или «192.168.1.5:47777». null — адрес некорректен. */
export function parseAddress(raw: string): { host: string; port: number } | null {
  const m = /^\s*([^\s:]+)(?::(\d{1,5}))?\s*$/.exec(raw);
  if (!m?.[1]) return null;
  const host = m[1];
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
  if (port < 1 || port > 65535) return null;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    if (ipv4.slice(1).some((part) => Number(part) > 255)) return null;
  } else if (!/^[a-z0-9][a-z0-9.-]*$/i.test(host) || /^[\d.]+$/.test(host)) {
    return null;
  }
  return { host, port };
}

export function joinScreen(props: JoinProps): JoinScreen {
  let busy = false;
  let disposed = false;

  const list = h('ul', { class: 'host-list', testid: 'host-list', 'aria-label': 'Найденные игры' });
  const listStatus = h('p', {
    class: 'muted list-status',
    role: 'status',
    testid: 'discover-status',
  });
  const refresh = button('Обновить', {
    testid: 'discover-refresh',
    variant: 'ghost',
    onClick: () => void discover(),
  });

  const input = h('input', {
    id: 'host-ip',
    class: 'input input-mono',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: '192.168.1.42',
    testid: 'ip-input',
    'aria-describedby': 'join-status',
  });
  const status = h('p', {
    id: 'join-status',
    class: 'field-hint',
    role: 'alert',
    testid: 'join-status',
  });
  const connectBtn = button('Подключиться', {
    testid: 'ip-connect',
    variant: 'primary',
    hint: 'Enter',
    onClick: () => connectManual(),
  });
  const backBtn = button('Назад', {
    testid: 'join-back',
    variant: 'ghost',
    hint: 'Esc',
    onClick: () => props.onBack(),
  });

  input.addEventListener('input', () => {
    status.textContent = '';
    status.classList.remove('is-error');
    input.removeAttribute('aria-invalid');
  });

  function connectManual(): void {
    if (busy) return;
    const addr = parseAddress(input.value);
    if (!addr) {
      showError('Введите IP-адрес, например 192.168.1.42');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    props.onConnect(addr.host, addr.port);
  }

  function showError(text: string): void {
    status.textContent = text;
    status.classList.add('is-error');
  }

  async function discover(): Promise<void> {
    refresh.disabled = true;
    list.replaceChildren();
    listStatus.textContent = 'Ищем игры в сети…';
    try {
      const hosts = await props.discover();
      if (disposed) return;
      listStatus.textContent = hosts.length ? '' : 'Игр не найдено. Введите адрес вручную.';
      for (const host of hosts) {
        const suffix = host.port === DEFAULT_PORT ? '' : `:${host.port}`;
        const item = h(
          'button',
          { type: 'button', class: 'host-item', testid: 'host-item', 'data-ip': host.ip },
          h('span', { class: 'host-name' }, host.name),
          h('span', { class: 'host-ip' }, host.ip + suffix),
        );
        item.addEventListener('click', () => {
          if (!busy) props.onConnect(host.ip, host.port);
        });
        list.append(h('li', {}, item));
      }
    } catch (err) {
      if (disposed) return;
      listStatus.textContent = `Автопоиск недоступен: ${errorMessage(err)}. Введите адрес вручную.`;
    } finally {
      if (!disposed) refresh.disabled = false;
    }
  }

  const el = h(
    'main',
    { class: 'join centered' },
    h('h2', { class: 'heading' }, 'Присоединиться'),
    h(
      'section',
      { class: 'panel stack' },
      h('div', { class: 'row-between' }, h('h3', { class: 'subheading' }, 'Игры в сети'), refresh),
      listStatus,
      list,
    ),
    h(
      'section',
      { class: 'panel stack' },
      h('label', { class: 'field-label', for: 'host-ip' }, 'Или введите адрес хоста'),
      h('div', { class: 'input-row' }, input, connectBtn),
      status,
    ),
    h('div', { class: 'actions actions-row' }, backBtn),
  );

  return {
    id: 'join',
    el,
    enter: connectManual,
    escape: () => props.onBack(),
    mounted: () => {
      input.focus();
      void discover();
    },
    destroy: () => {
      disposed = true;
    },
    setBusy: (text) => {
      busy = text !== null;
      input.disabled = busy;
      connectBtn.disabled = busy;
      for (const b of list.querySelectorAll('button')) b.disabled = busy;
      status.classList.remove('is-error');
      status.textContent = text ?? '';
      if (!busy) input.focus();
    },
    setError: (text) => {
      showError(text);
    },
  };
}
