// Canvas 2D рендерер лабиринта: стены, точки со свечением, след, туман войны, HUD.
import { maze as mazeCore, PLAYER_IDS, type PlayerId } from '@2dots/core';
import type { maze } from '@2dots/core';
import { visibleCells } from './fog';
import { cellIndex, DIR_VEC } from './grid';

type MazeState = maze.MazeState;
type MazePlayer = maze.MazePlayer;

const { WALL } = mazeCore;

export const COLORS = {
  bg: '#0e0f1a',
  floor: '#141628',
  wall: '#454a7a',
  fg: '#e8e9f3',
  muted: '#8a8ca8',
  danger: '#ff6b6b',
  p1: '#ff5d8f',
  p2: '#4dd6ff',
} as const;

const TRAIL_LENGTH = 20;
const HUD_HEIGHT = 56;
const PADDING = 20;

export interface MazeRendererOptions {
  /** Чей это экран. null — локальный режим: оба игрока равноправны. */
  you: PlayerId | null;
  labels: Record<PlayerId, string>;
  /** Рисовать туман войны (если в конфиге fogRadius !== null). */
  fog: boolean;
}

interface Point {
  x: number;
  y: number;
}

function playerPos(p: MazePlayer): Point {
  if (!p.dir || p.moveProgress <= 0) return { x: p.x, y: p.y };
  const [dx, dy] = DIR_VEC[p.dir];
  return { x: p.x + dx * p.moveProgress, y: p.y + dy * p.moveProgress };
}

/** Клетки, которые точка занимает визуально (текущая и та, куда идёт). */
function occupiedCells(state: MazeState, p: MazePlayer): number[] {
  const cells = [cellIndex(state.maze, p.x, p.y)];
  if (p.dir && p.moveProgress > 0) {
    const [dx, dy] = DIR_VEC[p.dir];
    cells.push(cellIndex(state.maze, p.x + dx, p.y + dy));
  }
  return cells;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class MazeRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private cssW = 0;
  private cssH = 0;

  private prev: MazeState | null = null;
  private cur: MazeState | null = null;
  private curAt = 0;
  private tickMs = 1000 / 30;
  private readonly trails: Record<PlayerId, Point[]> = { p1: [], p2: [] };

  private wallsPath: Path2D | null = null;
  private wallsKey = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private options: MazeRendererOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D недоступен');
    this.ctx = ctx;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(canvas);
    this.measure();
    this.raf = requestAnimationFrame(this.frame);
  }

  setOptions(patch: Partial<MazeRendererOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  get fog(): boolean {
    return this.options.fog;
  }

  /** Новый state целиком. Храним два последних для визуального lerp. */
  update(state: MazeState): void {
    const now = performance.now();
    if (this.cur && this.cur.seed === state.seed && state.tick > this.cur.tick) {
      const interval = now - this.curAt;
      this.tickMs = Math.min(100, Math.max(10, this.tickMs * 0.8 + interval * 0.2));
      this.prev = this.cur;
    } else {
      // Новый раунд или первый state — без интерполяции и со свежим следом.
      this.prev = null;
      this.trails.p1 = [];
      this.trails.p2 = [];
    }
    this.cur = state;
    this.curAt = now;
    for (const id of PLAYER_IDS) {
      const p = state.players[id];
      const trail = this.trails[id];
      const last = trail[trail.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) {
        trail.push({ x: p.x, y: p.y });
        if (trail.length > TRAIL_LENGTH) trail.shift();
      }
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  private measure(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
  }

  private syncBackingStore(): number {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.cssW * dpr);
    const h = Math.round(this.cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return dpr;
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dpr = this.syncBackingStore();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (this.cur) this.draw(this.cur, now);
  };

  private draw(state: MazeState, now: number): void {
    const ctx = this.ctx;
    const { width, height } = state.maze;
    const availW = this.cssW - PADDING * 2;
    const availH = this.cssH - HUD_HEIGHT - PADDING * 2;
    const cell = Math.max(4, Math.floor(Math.min(availW / width, availH / height)));
    const ox = Math.round((this.cssW - cell * width) / 2);
    const oy = Math.round(HUD_HEIGHT + PADDING + (availH - cell * height) / 2);
    const center = (p: Point): Point => ({
      x: ox + (p.x + 0.5) * cell,
      y: oy + (p.y + 0.5) * cell,
    });

    // Позиции с интерполяцией между двумя последними state.
    const t = Math.min(1, Math.max(0, (now - this.curAt) / this.tickMs));
    const pos = {} as Record<PlayerId, Point>;
    for (const id of PLAYER_IDS) {
      const b = playerPos(state.players[id]);
      const prev = this.prev?.players[id];
      const a = prev ? playerPos(prev) : b;
      const far = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 2;
      pos[id] = far ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    // Туман: что видно сейчас и что видели раньше.
    const radius = state.config.fogRadius;
    const fogOn = this.options.fog && radius !== null;
    const viewers = this.options.you ? [this.options.you] : PLAYER_IDS;
    let visible: Set<number> | null = null;
    let seen: Set<number> | null = null;
    if (fogOn) {
      visible = new Set();
      seen = new Set();
      for (const id of viewers) {
        const p = state.players[id];
        for (const i of visibleCells(state.maze, p.x, p.y, radius)) visible.add(i);
        if (p.dir && p.moveProgress > 0.5) {
          const [dx, dy] = DIR_VEC[p.dir];
          for (const i of visibleCells(state.maze, p.x + dx, p.y + dy, radius)) visible.add(i);
        }
        for (const i of p.visited) seen.add(i);
      }
    }

    // Пол.
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(ox, oy, cell * width, cell * height);

    // След (под стенами и туманом).
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of PLAYER_IDS) {
      const pts = [...this.trails[id].map(center), center(pos[id])];
      ctx.strokeStyle = COLORS[id];
      ctx.lineWidth = cell * 0.22;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] as Point;
        const b = pts[i] as Point;
        ctx.globalAlpha = 0.05 + 0.35 * (i / pts.length);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Стены.
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = Math.max(2, cell * 0.1);
    ctx.stroke(this.getWallsPath(state.seed, state.maze, cell, ox, oy));

    // Туман войны поверх: видимое ярко, посещённое тускло, остальное темно.
    if (visible && seen) {
      ctx.fillStyle = COLORS.bg;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (visible.has(i)) continue;
          ctx.globalAlpha = seen.has(i) ? 0.6 : 0.96;
          ctx.fillRect(ox + x * cell - 0.5, oy + y * cell - 0.5, cell + 1, cell + 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Точки. Соперник виден, только если он в видимой зоне.
    for (const id of PLAYER_IDS) {
      const isViewer = viewers.includes(id);
      if (!isViewer && visible) {
        const cells = occupiedCells(state, state.players[id]);
        if (!cells.some((i) => visible.has(i))) continue;
      }
      this.drawDot(center(pos[id]), cell, COLORS[id], id === this.options.you, now);
    }

    this.drawHud(state);
  }

  private drawDot(c: Point, cell: number, color: string, pulse: boolean, now: number): void {
    const ctx = this.ctx;
    const r = cell * 0.3;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = cell * 0.9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(c.x - r * 0.25, c.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (pulse) {
      const k = (now % 1200) / 1200;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * (1 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHud(state: MazeState): void {
    const ctx = this.ctx;
    const midY = HUD_HEIGHT / 2 + 6;
    ctx.textBaseline = 'middle';
    ctx.font = '600 16px -apple-system, "Segoe UI", system-ui, sans-serif';

    const label = (id: PlayerId, align: 'left' | 'right') => {
      const x = align === 'left' ? PADDING : this.cssW - PADDING;
      const dotX = align === 'left' ? x + 8 : x - 8;
      ctx.save();
      ctx.shadowColor = COLORS[id];
      ctx.shadowBlur = 12;
      ctx.fillStyle = COLORS[id];
      ctx.beginPath();
      ctx.arc(dotX, midY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = id === this.options.you ? COLORS.fg : COLORS.muted;
      ctx.textAlign = align;
      ctx.fillText(this.options.labels[id], align === 'left' ? x + 24 : x - 24, midY);
    };
    label('p1', 'left');
    label('p2', 'right');

    const remaining = state.config.timeLimitMs - state.elapsedMs;
    ctx.textAlign = 'center';
    ctx.font = '700 24px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = remaining <= 30_000 ? COLORS.danger : COLORS.fg;
    ctx.fillText(formatTime(remaining), this.cssW / 2, midY);
  }

  private getWallsPath(seed: number, m: maze.Maze, cell: number, ox: number, oy: number): Path2D {
    // Лабиринт однозначно задан seed — пересобираем путь только при смене seed или масштаба.
    const key = `${seed}:${m.width}x${m.height}:${cell}:${ox}:${oy}`;
    if (this.wallsPath && key === this.wallsKey) return this.wallsPath;
    const path = new Path2D();
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const w = m.walls[y * m.width + x] ?? 0;
        const x0 = ox + x * cell;
        const y0 = oy + y * cell;
        // Все установленные биты стен + внешняя рамка поля.
        if (w & WALL.up || y === 0) {
          path.moveTo(x0, y0);
          path.lineTo(x0 + cell, y0);
        }
        if (w & WALL.left || x === 0) {
          path.moveTo(x0, y0);
          path.lineTo(x0, y0 + cell);
        }
        if (w & WALL.down || y === m.height - 1) {
          path.moveTo(x0, y0 + cell);
          path.lineTo(x0 + cell, y0 + cell);
        }
        if (w & WALL.right || x === m.width - 1) {
          path.moveTo(x0 + cell, y0);
          path.lineTo(x0 + cell, y0 + cell);
        }
      }
    }
    this.wallsPath = path;
    this.wallsKey = key;
    return path;
  }
}
