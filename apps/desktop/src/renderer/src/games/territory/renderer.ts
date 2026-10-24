// Canvas 2D рендерер «Территории»: закрашенные клетки со «свежей краской», стены, точки
// со свечением и следом, туман войны, HUD со шкалой перетягивания и финальная анимация.
import { maze as mazeCore, PLAYER_IDS, type PlayerId } from '@2dots/core';
import type { maze } from '@2dots/core';
import { COLORS } from '../maze/renderer';
import {
  clamp01,
  easeOutCubic,
  flash,
  fogLift,
  formatTime,
  outroCounts,
  outroProgress,
  OUTRO_MS,
  p1Share,
  paintPop,
  sweep,
  timerStyle,
} from './anim';
import { ownerId, type TerritoryState } from './types';

type MazePlayer = maze.MazePlayer;

const { WALL, DELTA, visibleCells } = mazeCore;

const TRAIL_LENGTH = 14;
const HUD_HEIGHT = 56;
/** Шкала перетягивания под HUD. */
const BAR_HEIGHT = 34;
const PADDING = 20;
/** Прозрачность заливки своих клеток. */
const CELL_ALPHA = 0.35;
const FONT = '-apple-system, "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export interface TerritoryRendererOptions {
  you: PlayerId;
  names: Record<PlayerId, string>;
  match: Record<PlayerId, number> | null;
}

interface Point {
  x: number;
  y: number;
}

function playerPos(p: MazePlayer): Point {
  if (!p.dir || p.moveProgress <= 0) return { x: p.x, y: p.y };
  const [dx, dy] = DELTA[p.dir];
  return { x: p.x + dx * p.moveProgress, y: p.y + dy * p.moveProgress };
}

/** Клетки, которые точка занимает визуально (текущая и та, куда идёт). */
function occupiedCells(width: number, p: MazePlayer): number[] {
  const cells = [p.y * width + p.x];
  if (p.dir && p.moveProgress > 0) {
    const [dx, dy] = DELTA[p.dir];
    cells.push((p.y + dy) * width + p.x + dx);
  }
  return cells;
}

/** Цвет игрока с прозрачностью: '#rrggbb' → 'rgba(…)'. */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export class TerritoryRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private cssW = 0;
  private cssH = 0;

  private prev: TerritoryState | null = null;
  private cur: TerritoryState | null = null;
  private curAt = 0;
  private tickMs = 1000 / 30;
  private readonly trails: Record<PlayerId, Point[]> = { p1: [], p2: [] };
  /** Когда клетка последний раз сменила владельца (performance.now()). */
  private paintedAt: Float64Array = new Float64Array(0);
  private outroAt: number | null = null;

  private wallsPath: Path2D | null = null;
  private wallsKey = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: TerritoryRendererOptions,
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

  /** Новый state целиком. Храним два последних для визуального lerp. */
  update(state: TerritoryState): void {
    const now = performance.now();
    const cur = this.cur;
    if (cur && cur.seed === state.seed && state.tick > cur.tick) {
      const interval = now - this.curAt;
      this.tickMs = Math.min(100, Math.max(10, this.tickMs * 0.8 + interval * 0.2));
      this.prev = cur;
      // «Свежая краска»: клетки, сменившие владельца с прошлого state.
      for (let i = 0; i < state.owner.length; i++) {
        if (state.owner[i] !== cur.owner[i] && state.owner[i] !== 0) this.paintedAt[i] = now;
      }
    } else if (!cur || cur.seed !== state.seed || state.tick < cur.tick) {
      // Новый раунд или первый state — без интерполяции, следа и вспышек.
      this.prev = null;
      this.trails.p1 = [];
      this.trails.p2 = [];
      this.outroAt = null;
      this.paintedAt = new Float64Array(state.owner.length).fill(-Infinity);
    }
    this.cur = state;
    this.curAt = now;
    if (state.result && this.outroAt === null) this.outroAt = now;
    if (this.outroAt !== null) return; // финал: всё замирает
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

  /** Сколько ещё мс идёт финальная анимация (0 — её нет или она закончилась). */
  outroRemainingMs(): number {
    return this.outroAt === null ? 0 : Math.max(0, this.outroAt + OUTRO_MS - performance.now());
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

  private draw(state: TerritoryState, now: number): void {
    const ctx = this.ctx;
    const { width, height } = state.maze;
    const you = this.options.you;
    const top = HUD_HEIGHT + BAR_HEIGHT;
    const availW = this.cssW - PADDING * 2;
    const availH = this.cssH - top - PADDING * 2;
    const cell = Math.max(4, Math.floor(Math.min(availW / width, availH / height)));
    const boardW = cell * width;
    const boardH = cell * height;
    const ox = Math.round((this.cssW - boardW) / 2);
    const oy = Math.round(top + PADDING + (availH - boardH) / 2);
    const center = (p: Point): Point => ({
      x: ox + (p.x + 0.5) * cell,
      y: oy + (p.y + 0.5) * cell,
    });
    const k = this.outroAt === null ? null : outroProgress(this.outroAt, now);
    const lift = k === null ? 0 : fogLift(k);

    // Позиции с интерполяцией между двумя последними state (на финале — замерли).
    const t = clamp01((now - this.curAt) / this.tickMs);
    const pos = {} as Record<PlayerId, Point>;
    for (const id of PLAYER_IDS) {
      const b = playerPos(state.players[id]);
      const prev = k === null ? this.prev?.players[id] : undefined;
      const a = prev ? playerPos(prev) : b;
      const far = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 2;
      pos[id] = far ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    // Туман: видимое сейчас — от своей точки по проходам.
    const radius = state.config.fogRadius;
    let visible: Set<number> | null = null;
    if (radius !== null) {
      visible = new Set();
      const p = state.players[you];
      // После мгновенного разворота (x, y) — ещё не достигнутая клетка (её core ставит сразу),
      // поэтому обзор от неё — только когда точка физически ближе к ней.
      if (p.moveProgress <= 0.5 || p.visited.includes(p.y * width + p.x)) {
        for (const i of visibleCells(state.maze, p.x, p.y, radius)) visible.add(i);
      }
      if (p.dir && p.moveProgress > 0.5) {
        const [dx, dy] = DELTA[p.dir];
        for (const i of visibleCells(state.maze, p.x + dx, p.y + dy, radius)) visible.add(i);
      }
    }

    // Пол.
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(ox, oy, boardW, boardH);

    // Территории. На финале — вспышки.
    const boost = k === null ? 0 : flash(k);
    const alpha = Math.min(0.85, CELL_ALPHA + 0.4 * boost);
    for (const id of PLAYER_IDS) {
      const code = id === 'p1' ? 1 : 2;
      ctx.fillStyle = rgba(COLORS[id], alpha);
      for (let i = 0; i < state.owner.length; i++) {
        if (state.owner[i] !== code) continue;
        ctx.fillRect(ox + (i % width) * cell, oy + Math.floor(i / width) * cell, cell, cell);
      }
    }

    // «Свежая краска»: клетка вспыхивает и раскрывается из центра.
    for (let i = 0; i < state.owner.length; i++) {
      const pop = paintPop(now - (this.paintedAt[i] ?? -Infinity));
      const owner = ownerId(state.owner[i]);
      if (pop <= 0 || !owner) continue;
      if (visible && owner !== you && !visible.has(i)) continue;
      const size = cell * (0.3 + 0.7 * easeOutCubic(1 - pop));
      const cx = ox + ((i % width) + 0.5) * cell;
      const cy = oy + (Math.floor(i / width) + 0.5) * cell;
      ctx.fillStyle = rgba(COLORS[owner], 0.75 * pop);
      ctx.beginPath();
      ctx.roundRect(cx - size / 2, cy - size / 2, size, size, cell * 0.12);
      ctx.fill();
    }

    // След соперника в тумане — только по видимым клеткам, иначе он просвечивает.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of PLAYER_IDS) {
      if (k !== null) break;
      const cells = [...this.trails[id], pos[id]];
      const pts = cells.map(center);
      const hidden = visible !== null && id !== you;
      const shown = (p: Point) => visible?.has(Math.round(p.y) * width + Math.round(p.x)) ?? true;
      ctx.strokeStyle = COLORS[id];
      ctx.lineWidth = cell * 0.2;
      for (let i = 1; i < pts.length; i++) {
        if (hidden && !(shown(cells[i - 1] as Point) && shown(cells[i] as Point))) continue;
        const a = pts[i - 1] as Point;
        const b = pts[i] as Point;
        ctx.globalAlpha = 0.05 + 0.4 * (i / pts.length);
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

    // Туман поверх: видимое ярко, своя территория тускло, остальное темно.
    if (visible && lift < 1) {
      ctx.fillStyle = COLORS.bg;
      for (let i = 0; i < state.owner.length; i++) {
        if (visible.has(i)) continue;
        const own = ownerId(state.owner[i]) === you;
        ctx.globalAlpha = (own ? 0.55 : 1) * (1 - lift);
        ctx.fillRect(
          ox + (i % width) * cell - 0.5,
          oy + Math.floor(i / width) * cell - 0.5,
          cell + 1,
          cell + 1,
        );
      }
      ctx.globalAlpha = 1;
    }

    // Финал: цвет победителя пробегает по полю.
    if (k !== null && state.result) this.drawSweep(state, k, ox, oy, boardW, boardH);

    // Точки. Соперник в тумане виден, только если он в видимой зоне.
    for (const id of PLAYER_IDS) {
      if (id !== you && visible && lift < 0.5) {
        const cells = occupiedCells(width, state.players[id]);
        if (!cells.some((i) => visible.has(i))) continue;
      }
      this.drawDot(center(pos[id]), cell, COLORS[id], id === you && k === null, now);
    }

    if (k !== null) this.drawOutroLabel(k, cell);
    this.drawHud(state, now, k);
  }

  private drawSweep(
    state: TerritoryState,
    k: number,
    ox: number,
    oy: number,
    boardW: number,
    boardH: number,
  ): void {
    const s = sweep(k);
    if (s < 0) return;
    const ctx = this.ctx;
    const winner = state.result?.winner;
    const band = boardW * 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, boardW, boardH);
    ctx.clip();
    const bands: { color: string; from: 'left' | 'right' }[] =
      winner === 'p1' || winner === 'p2'
        ? [{ color: COLORS[winner], from: 'left' }]
        : [
            { color: COLORS.p1, from: 'left' },
            { color: COLORS.p2, from: 'right' },
          ];
    for (const b of bands) {
      // Волна: яркая кромка, за ней остаётся лёгкий оттенок цвета победителя.
      const edge =
        b.from === 'left'
          ? ox - band + (boardW + band) * s
          : ox + boardW + band - (boardW + band) * s;
      const g = ctx.createLinearGradient(edge - band, 0, edge + band, 0);
      const tint = rgba(b.color, 0.12);
      const bright = rgba(b.color, 0.45);
      const none = rgba(b.color, 0);
      if (b.from === 'left') {
        g.addColorStop(0, tint);
        g.addColorStop(0.5, bright);
        g.addColorStop(1, none);
      } else {
        g.addColorStop(0, none);
        g.addColorStop(0.5, bright);
        g.addColorStop(1, tint);
      }
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, boardW, boardH);
      ctx.fillStyle = tint;
      if (b.from === 'left') ctx.fillRect(ox, oy, Math.max(0, edge - band - ox), boardH);
      else ctx.fillRect(edge + band, oy, Math.max(0, ox + boardW - edge - band), boardH);
    }
    ctx.restore();
  }

  private drawOutroLabel(k: number, cell: number): void {
    const textIn = clamp01((k - 0.1) / 0.2);
    if (textIn <= 0) return;
    const ctx = this.ctx;
    const size = Math.round(
      Math.min(64, Math.max(28, cell * 2.2)) * (0.7 + 0.3 * easeOutCubic(textIn)),
    );
    ctx.save();
    ctx.globalAlpha = textIn;
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.fg;
    ctx.fillText('Время вышло', this.cssW / 2, (HUD_HEIGHT + BAR_HEIGHT + this.cssH) / 2);
    ctx.restore();
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
    // Белая обводка — точку видно и на клетках своего цвета.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(c.x - r * 0.25, c.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (pulse) {
      const p = (now % 1200) / 1200;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5 * (1 - p);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * (1 + p * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHud(state: TerritoryState, now: number, k: number | null): void {
    const ctx = this.ctx;
    const midY = HUD_HEIGHT / 2 + 6;
    ctx.textBaseline = 'middle';
    ctx.font = `600 16px ${FONT}`;

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
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = id === this.options.you ? COLORS.fg : COLORS.muted;
      ctx.textAlign = align;
      ctx.fillText(this.options.names[id], align === 'left' ? x + 24 : x - 24, midY);
    };
    label('p1', 'left');
    label('p2', 'right');

    // Таймер: последние 10 с — красный и пульсирует.
    const remaining = state.config.timeLimitMs - state.elapsedMs;
    const timer = timerStyle(remaining);
    const cx = this.cssW / 2;
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(24 * timer.scale)}px ${MONO}`;
    ctx.fillStyle = timer.danger ? COLORS.danger : COLORS.fg;
    if (timer.danger && timer.scale > 1) {
      ctx.save();
      ctx.shadowColor = COLORS.danger;
      ctx.shadowBlur = 18 * (timer.scale - 1) * 5;
      ctx.fillText(formatTime(remaining), cx, midY);
      ctx.restore();
    } else {
      ctx.fillText(formatTime(remaining), cx, midY);
    }

    // Счёт матча по бокам от таймера, цветами игроков.
    const match = this.options.match;
    if (match) {
      const gap = 62;
      ctx.font = `700 20px ${MONO}`;
      ctx.fillStyle = COLORS.p1;
      ctx.textAlign = 'right';
      ctx.fillText(String(match.p1), cx - gap, midY);
      ctx.fillStyle = COLORS.p2;
      ctx.textAlign = 'left';
      ctx.fillText(String(match.p2), cx + gap, midY);
    }

    // Шкала перетягивания: доли закрашенных клеток. На финале числа досчитывают до итога.
    const final = state.result?.scores ?? state.counts;
    const counts = k === null ? state.counts : outroCounts(final, k);
    this.drawTugBar(counts, now);
  }

  private drawTugBar(counts: Record<PlayerId, number>, now: number): void {
    const ctx = this.ctx;
    const barW = Math.min(440, this.cssW * 0.5);
    const barH = 10;
    const x0 = (this.cssW - barW) / 2;
    const y = HUD_HEIGHT + BAR_HEIGHT / 2 - 2;
    const split = x0 + barW * p1Share(counts);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y - barH / 2, barW, barH, barH / 2);
    ctx.clip();
    ctx.fillStyle = COLORS.p1;
    ctx.fillRect(x0, y - barH / 2, split - x0, barH);
    ctx.fillStyle = COLORS.p2;
    ctx.fillRect(split, y - barH / 2, x0 + barW - split, barH);
    // Блик сверху.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, y - barH / 2, barW, barH / 3);
    ctx.restore();

    // Граница: светящаяся «верёвка».
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10 + 4 * Math.sin(now / 200);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(split - 2, y - barH / 2 - 4, 4, barH + 8, 2);
    ctx.fill();
    ctx.restore();

    // Отметка середины.
    ctx.fillStyle = 'rgba(14,15,26,0.6)';
    ctx.fillRect(x0 + barW / 2 - 0.5, y - barH / 2, 1, barH);

    ctx.font = `700 16px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.p1;
    ctx.textAlign = 'right';
    ctx.fillText(String(counts.p1), x0 - 12, y + 1);
    ctx.fillStyle = COLORS.p2;
    ctx.textAlign = 'left';
    ctx.fillText(String(counts.p2), x0 + barW + 12, y + 1);
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
