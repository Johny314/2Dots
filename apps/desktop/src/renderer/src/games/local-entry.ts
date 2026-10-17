// Точка входа режима ?local=1 (без сети, два игрока на одной клавиатуре).
// Владелец — трек E. main.ts вызывает startLocalMode при ?local=1.
import { maze, type PlayerId } from '@2dots/core';
import { devInit, devTick } from './maze/dev-sim';
import { ARROWS, createKeyInput, WASD } from './maze/input';
import { COLORS, MazeRenderer } from './maze/renderer';

type Dir = maze.Dir;
type MazeState = maze.MazeState;

const { mazeGame } = maze;
const TICK_MS = 1000 / mazeGame.tickHz;
const MAX_TICKS_PER_FRAME = 5;
const LABELS: Record<PlayerId, string> = { p1: 'Игрок 1 · WASD', p2: 'Игрок 2 · стрелки' };

export function startLocalMode(root: HTMLElement): void {
  root.innerHTML = '';
  root.dataset.testid = 'local-mode';
  Object.assign(root.style, { position: 'relative', overflow: 'hidden' });

  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'maze-canvas';
  root.append(canvas);

  const overlay = document.createElement('div');
  overlay.dataset.testid = 'local-result';
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'none',
    placeContent: 'center',
    justifyItems: 'center',
    gap: '12px',
    background: 'rgba(14, 15, 26, 0.72)',
    textAlign: 'center',
  });
  root.append(overlay);

  const hint = document.createElement('div');
  hint.textContent = 'F — туман войны · R — новый лабиринт';
  Object.assign(hint.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '4px',
    textAlign: 'center',
    fontSize: '12px',
    color: COLORS.muted,
    pointerEvents: 'none',
  });
  root.append(hint);

  const renderer = new MazeRenderer(canvas, { you: null, labels: LABELS, fog: false });
  const held: Record<PlayerId, Dir | null> = { p1: null, p2: null };
  let seed = 1;
  let state: MazeState = devInit(seed);
  let acc = 0;
  let last = performance.now();
  let shownResult = false;

  const publish = () => {
    renderer.update(structuredClone(state));
    // Для e2e: текущие клетки игроков.
    for (const id of ['p1', 'p2'] as const) {
      const p = state.players[id];
      root.dataset[id] = `${p.x},${p.y}`;
    }
  };

  const restart = () => {
    seed++;
    state = devInit(seed);
    for (const id of ['p1', 'p2'] as const) mazeGame.applyInput(state, id, { dir: held[id] });
    acc = 0;
    shownResult = false;
    overlay.style.display = 'none';
    publish();
  };

  const showResult = (r: maze.MazeResult) => {
    const pct = (id: PlayerId) =>
      r.pathLength > 0 ? Math.round((r.scores[id] / r.pathLength) * 100) : 0;
    const title =
      r.winner === 'draw'
        ? r.reason === 'timeout'
          ? 'Время вышло — ничья'
          : 'Ничья'
        : `Победил ${r.winner === 'p1' ? 'Игрок 1' : 'Игрок 2'}`;
    const color = r.winner === 'draw' ? COLORS.fg : COLORS[r.winner];
    overlay.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = title;
    Object.assign(h.style, { margin: '0', fontSize: '40px', color });
    const p = document.createElement('p');
    p.textContent = `Игрок 1 прошёл ${pct('p1')}% пути · Игрок 2 — ${pct('p2')}%`;
    p.style.margin = '0';
    const again = document.createElement('p');
    again.textContent = 'R — ещё раз';
    Object.assign(again.style, { margin: '0', color: COLORS.muted });
    overlay.append(h, p, again);
    overlay.style.display = 'grid';
  };

  const bindPlayer = (id: PlayerId, keymap: typeof WASD) =>
    createKeyInput(keymap, (dir) => {
      held[id] = dir;
      const input = mazeGame.parseInput({ dir });
      if (input) mazeGame.applyInput(state, id, input);
    });
  bindPlayer('p1', WASD);
  bindPlayer('p2', ARROWS);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyF') renderer.setOptions({ fog: !renderer.fog });
    else if (e.code === 'KeyR') restart();
  });

  // Фиксированный тик: накапливаем реальное время и тикаем шагами TICK_MS.
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    acc += Math.max(0, now - last);
    last = now;
    let ticks = 0;
    while (acc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      devTick(state, TICK_MS);
      acc -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) acc = 0;
    if (ticks > 0) publish();
    const result = mazeGame.result(state);
    if (result && !shownResult) {
      shownResult = true;
      showResult(result);
    }
  };
  publish();
  requestAnimationFrame(loop);
}
