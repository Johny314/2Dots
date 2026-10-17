// Простой роутер экранов: один активный экран, Enter/Esc делегируются ему.

export interface Screen {
  /** Используется в data-testid="screen-<id>". */
  readonly id: string;
  readonly el: HTMLElement;
  /** Основное действие (Enter). */
  enter?(): void;
  /** Назад / отмена (Esc). */
  escape?(): void;
  /** Вызывается после вставки в DOM (фокус и т. п.). */
  mounted?(): void;
  destroy?(): void;
}

export class Router {
  private current: Screen | null = null;

  constructor(private readonly root: HTMLElement) {
    window.addEventListener('keydown', this.onKey);
  }

  get screenId(): string | null {
    return this.current?.id ?? null;
  }

  show(screen: Screen): void {
    this.current?.destroy?.();
    this.current = screen;
    screen.el.dataset.testid = `screen-${screen.id}`;
    screen.el.classList.add('screen');
    this.root.replaceChildren(screen.el);
    screen.mounted?.();
  }

  dispose(): void {
    this.current?.destroy?.();
    this.current = null;
    window.removeEventListener('keydown', this.onKey);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const screen = this.current;
    if (!screen || e.isComposing) return;
    if (e.key === 'Enter') {
      if (e.repeat) return;
      // Кнопки и списки обрабатывают Enter сами.
      const t = e.target;
      if (
        t instanceof HTMLButtonElement ||
        t instanceof HTMLSelectElement ||
        t instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (screen.enter) {
        e.preventDefault();
        screen.enter();
      }
    } else if (e.key === 'Escape') {
      if (screen.escape) {
        e.preventDefault();
        screen.escape();
      }
    }
  };
}
