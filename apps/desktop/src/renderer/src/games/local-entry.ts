// Точка входа режима ?local=1 (без сети, два игрока на одной клавиатуре).
// Владелец — трек E. main.ts (трек D) вызывает startLocalMode при ?local=1.
export function startLocalMode(root: HTMLElement): void {
  root.textContent = 'Локальный режим: не реализован (трек E)';
}
