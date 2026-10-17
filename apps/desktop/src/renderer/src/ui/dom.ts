// Мини-хелпер для построения DOM без innerHTML (имена игроков приходят из сети).

type AttrValue = string | number | boolean | null | undefined | ((event: Event) => void);
export type Attrs = Record<string, AttrValue>;
export type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(key.replace(/^on/, '').toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'testid') {
      el.dataset.testid = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

export function clear(el: Element): void {
  el.replaceChildren();
}

/** Подсказка клавиши внутри кнопки. */
export function kbd(label: string): HTMLElement {
  return h('kbd', { 'aria-hidden': 'true' }, label);
}

/** Айдентика: две светящиеся точки. */
export function dotsLogo(size: 'lg' | 'md' | 'sm' = 'md', animated = false): HTMLElement {
  return h(
    'div',
    { class: `dots dots-${size}${animated ? ' dots-seek' : ''}`, 'aria-hidden': 'true' },
    h('span', { class: 'dot p1' }),
    h('span', { class: 'dot p2' }),
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Ошибки из ipcRenderer.invoke приходят как "Error invoking remote method 'x': Error: текст".
    return err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
  return String(err);
}
