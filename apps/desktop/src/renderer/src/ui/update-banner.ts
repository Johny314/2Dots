// Баннер обновления в углу окна. Во время раунда скрыт, чтобы не отвлекать.
import type { DesktopApi, UpdateStatus } from '../../../shared/api';
import { h } from './dom';
import type { Router } from './router';

export function mountUpdateBanner(api: DesktopApi, router: Router): () => void {
  const el = h('aside', {
    class: 'update-banner',
    role: 'status',
    'aria-live': 'polite',
    testid: 'update-banner',
    hidden: true,
  });
  document.body.append(el);

  let status: UpdateStatus = { state: 'idle' };
  /** Версия, которую игрок закрыл крестиком, — до следующего изменения состояния. */
  let dismissed: string | null = null;

  const key = (s: UpdateStatus) => ('version' in s ? `${s.state}:${s.version}` : s.state);

  function action(label: string, testid: string, onClick: () => void): HTMLButtonElement {
    const btn = h('button', { type: 'button', class: 'btn btn-primary btn-sm', testid }, label);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function close(): HTMLButtonElement {
    const btn = h(
      'button',
      { type: 'button', class: 'update-close', 'aria-label': 'Скрыть', testid: 'update-dismiss' },
      '×',
    );
    btn.addEventListener('click', () => {
      dismissed = key(status);
      render();
    });
    return btn;
  }

  function render(): void {
    const s = status;
    const inGame = router.screenId === 'game';
    if (s.state === 'idle' || inGame || dismissed === key(s)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = `update-banner state-${s.state}`;
    switch (s.state) {
      case 'available':
        el.replaceChildren(
          h(
            'div',
            { class: 'update-text' },
            h('strong', {}, `Вышла версия ${s.version}`),
            h('span', { class: 'muted small' }, 'Скачайте и установите поверх текущей'),
          ),
          action('Скачать', 'update-download', () => api.openReleasePage()),
          close(),
        );
        break;
      case 'downloading':
        el.replaceChildren(
          h(
            'div',
            { class: 'update-text' },
            h('strong', {}, `Загружаем версию ${s.version}…`),
            h('span', { class: 'muted small' }, `${s.percent}%`),
          ),
          h(
            'div',
            { class: 'update-progress', 'aria-hidden': 'true' },
            h('span', { style: `width: ${s.percent}%` }),
          ),
        );
        break;
      case 'ready':
        el.replaceChildren(
          h(
            'div',
            { class: 'update-text' },
            h('strong', {}, `Версия ${s.version} готова`),
            h('span', { class: 'muted small' }, 'Или установится сама при выходе из игры'),
          ),
          action('Перезапустить', 'update-install', () => api.installUpdate()),
          close(),
        );
        break;
      case 'error':
        el.replaceChildren(h('div', { class: 'update-text' }, h('strong', {}, s.message)), close());
        break;
    }
  }

  const offStatus = api.onUpdate((next) => {
    status = next;
    render();
  });
  const offShow = router.onShow(() => render());
  return () => {
    offStatus();
    offShow();
    el.remove();
  };
}
