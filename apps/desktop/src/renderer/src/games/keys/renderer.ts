// Canvas 2D рендерер «Ключа и двери»: стены, портал выхода, двери и плиты цветов игроков,
// точки со свечением и следом, туман войны с памятью увиденного, HUD и финал.
import { maze as mazeCore, PLAYER_IDS, type PlayerId } from '@2dots/core';
import type { maze } from '@2dots/core';
import { COLORS } from '../maze/renderer';
import {
  clamp01,
  createKeysOutro,
  divePos,
  drawKeysOutro,
  fogLift,
  type KeysOutro,
  type Point,
} from './outro';
import { formatCountdown } from './summary';
import type { Door, KeysState } from './types';

type MazePlayer = maze.MazePlayer;

const { WALL, DELTA, visibleCells } = mazeCore;

const TRAIL_LENGTH = 20;
const HUD_HEIGHT = 56;
const PADDING = 20;
/** Сколько длится исчезновение открытой двери (по игровому времени). */
const DOOR_FADE_MS = 700;
/** Подсказка в начале раунда. */
const HINT_MS = 7000;
const PORTAL = '#b892ff';

export interface KeysRendererOptions {
  you: PlayerId;
  names: Record<PlayerId, string>;
}

function playerPos(p: MazePlayer): Point {
  if (!p.dir || p.moveProgress <= 0) return { x: p.x, y: p.y };
  const [dx, dy] = DELTA[p.dir];
  return { x: p.x + dx * p.moveProgress, y: p.y + dy * p.moveProgress };
}

/** Клетки, которые точка занимает визуально (текущая и та, куда идёт). */
function occupiedCells(m: maze.Maze, p: MazePlayer): number[] {
  const cells = [p.y * m.width + p.x];
  if (p.dir && p.moveProgress > 0) {
    const [dx, dy] = DELTA[p.dir];
    cells.push((p.y + dy) * m.width + p.x + dx);
  }
  return cells;
}

/** Клетки, видимые из позиции точки (с учётом мгновенного разворота, как в лабиринте). */
function visibleFrom(m: maze.Maze, p: MazePlayer, radius: number): number[] {
  const out: number[] = [];
  const here = p.y * m.width + p.x;
  if (p.moveProgress <= 0.5 || p.visited.includes(here)) {
    out.push(...visibleCells(m, p.x, p.y, radius));
  }
  if (p.dir && p.moveProgress > 0.5) {
    const [dx, dy] = DELTA[p.dir];
    out.push(...visibleCells(m, p.x + dx, p.y + dy, radius));
  }
  return out;
}

/** Геометрия двери в клетках: центр на границе клеток и ориентация. */
export function doorGeometry(
  width: number,
  d: Pick<Door, 'a' | 'b'>,
): {
  x: number;
  y: number;
  vertical: boolean;
} {
  const ax = d.a % width;
  const ay = Math.floor(d.a / width);
  const bx = d.b % width;
  const by = Math.floor(d.b / width);
  // Соседи по горизонтали — граница вертикальная (дверь — вертикальная планка).
  if (ay === by) return { x: Math.max(ax, bx), y: ay + 0.5, vertical: true };
  return { x: ax + 0.5, y: Math.max(ay, by), vertical: false };
}

export class KeysRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private cssW = 0;
  private cssH = 0;

  private prev: KeysState | null = null;
  private cur: KeysState | null = null;
  private curAt = 0;
  private tickMs = 1000 / 30;
  private readonly trails: Record<PlayerId, Point[]> = { p1: [], p2: [] };
  /** Туман: что видно сейчас и что видели за раунд. */
  private visible: Set<number> | null = null;
  private readonly seen = new Set<number>();

  private wallsPath: Path2D | null = null;
  private wallsKey = '';
  private outro: KeysOutro | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: KeysRendererOptions,
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

  update(state: KeysState): void {
    const now = performance.now();
    if (this.cur && this.cur.seed === state.seed && state.tick > this.cur.tick) {
      const interval = now - this.curAt;
      this.tickMs = Math.min(100, Math.max(10, this.tickMs * 0.8 + interval * 0.2));
      this.prev = this.cur;
    } else {
      // Новый раунд или первый state.
      this.prev = null;
      this.trails.p1 = [];
      this.trails.p2 = [];
      this.seen.clear();
      this.outro = null;
    }
    this.cur = state;
    this.curAt = now;
    if (state.result && !this.outro) this.outro = createKeysOutro(state.result.reason, now);

    const radius = state.config.fogRadius;
    if (radius === null) {
      this.visible = null;
    } else {
      const me = state.players[this.options.you];
      this.visible = new Set(visibleFrom(state.maze, me, radius));
      for (const i of this.visible) this.seen.add(i);
      for (const i of me.visited) this.seen.add(i);
    }

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

  outroRemainingMs(): number {
    const o = this.outro;
    return o ? Math.max(0, o.startedAt + o.durationMs - performance.now()) : 0;
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

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.cssW * dpr);
    const h = Math.round(this.cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (this.cur) this.draw(this.cur, now);
  };

  private draw(state: KeysState, now: number): void {
    const ctx = this.ctx;
    const m = state.maze;
    const { width, height } = m;
    const availW = this.cssW - PADDING * 2;
    const availH = this.cssH - HUD_HEIGHT - PADDING * 2;
    const cell = Math.max(4, Math.floor(Math.min(availW / width, availH / height)));
    const ox = Math.round((this.cssW - cell * width) / 2);
    const oy = Math.round(HUD_HEIGHT + PADDING + (availH - cell * height) / 2);
    const center = (p: Point): Point => ({
      x: ox + (p.x + 0.5) * cell,
      y: oy + (p.y + 0.5) * cell,
    });
    const outro = this.outro;
    const lift = outro ? fogLift(outro, now) : 0;
    const you = this.options.you;
    // Игровое время с интерполяцией между тиками — для анимаций дверей.
    const sinceTick = Math.min(this.tickMs, now - this.curAt);
    const gameNow = state.elapsedMs + (state.result ? 0 : sinceTick);

    // Позиции с интерполяцией между двумя последними state.
    const t = clamp01((now - this.curAt) / this.tickMs);
    const pos = {} as Record<PlayerId, Point>;
    for (const id of PLAYER_IDS) {
      const b = playerPos(state.players[id]);
      const prev = this.prev?.players[id];
      const a = prev ? playerPos(prev) : b;
      const far = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 2;
      pos[id] = far ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    const visible = lift >= 1 ? null : this.visible;
    const seen = this.seen;
    /** Насколько видна клетка: 1 — сейчас, dim — видели раньше, 0 — никогда. */
    const vis = (i: number, dim: number): number => {
      if (!visible) return 1;
      const base = visible.has(i) ? 1 : seen.has(i) ? dim : 0;
      return base + (1 - base) * lift;
    };

    // Пол.
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(ox, oy, cell * width, cell * height);

    // След (под стенами и туманом). След напарника в тумане — только по видимым клеткам.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of PLAYER_IDS) {
      if (outro?.reason === 'escaped') break;
      const cells = [...this.trails[id], pos[id]];
      const pts = cells.map(center);
      const hidden = visible !== null && id !== you;
      const shown = (p: Point) => visible?.has(Math.round(p.y) * width + Math.round(p.x)) ?? true;
      ctx.strokeStyle = COLORS[id];
      ctx.lineWidth = cell * 0.22;
      for (let i = 1; i < pts.length; i++) {
        if (hidden && !(shown(cells[i - 1] as Point) && shown(cells[i] as Point))) continue;
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
    ctx.stroke(this.getWallsPath(state.seed, m, cell, ox, oy));

    // Туман: видимое ярко, увиденное раньше тускло, остальное темно.
    if (visible) {
      ctx.fillStyle = COLORS.bg;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (visible.has(i)) continue;
          ctx.globalAlpha = (seen.has(i) ? 0.62 : 1) * (1 - lift);
          ctx.fillRect(ox + x * cell - 0.5, oy + y * cell - 0.5, cell + 1, cell + 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Портал выхода — маяк: виден всегда, сквозь туман слабее.
    const exitIdx = state.exit[1] * width + state.exit[0];
    const portalC = center({ x: state.exit[0], y: state.exit[1] });
    this.drawPortal(portalC, cell, now, Math.max(0.45, vis(exitIdx, 0.75)), outro, now);

    // Плиты и двери поверх тумана: увиденные остаются в памяти тусклыми.
    for (const d of state.doors) {
      const a = vis(d.plate, 0.4);
      if (a > 0) this.drawPlate(center(this.cellPoint(d.plate, width)), cell, d, a, gameNow, now);
    }
    for (const d of state.doors) {
      const a = Math.max(vis(d.a, 0.4), vis(d.b, 0.4));
      if (a > 0) this.drawDoor(state, d, cell, ox, oy, a, gameNow);
    }

    // Точки. Напарник — только если виден.
    for (const id of PLAYER_IDS) {
      let p = pos[id];
      let scale = 1;
      if (outro) {
        const sideOf: 0 | 1 = id === 'p1' ? 1 : 0;
        const dive = divePos(outro, p, { x: state.exit[0], y: state.exit[1] }, sideOf, now);
        if (!dive) continue;
        p = dive.p;
        scale = dive.scale;
      } else if (id !== you && visible) {
        const cells = occupiedCells(m, state.players[id]);
        if (!cells.some((i) => visible.has(i))) continue;
      }
      this.drawDot(center(p), cell, COLORS[id], id === you && !outro, now, scale);
    }

    if (outro) {
      drawKeysOutro(outro, now, {
        ctx,
        portal: portalC,
        cell,
        width: this.cssW,
        height: this.cssH,
        colors: { p1: COLORS.p1, p2: COLORS.p2, fg: COLORS.fg, bg: COLORS.bg },
      });
    } else {
      this.drawToasts(state, gameNow, oy, cell);
    }

    this.drawHud(state);
  }

  private cellPoint(i: number, width: number): Point {
    return { x: i % width, y: Math.floor(i / width) };
  }

  /** Портал: светящийся диск с вращающимися дугами цветов игроков. */
  private drawPortal(
    c: Point,
    cell: number,
    now: number,
    alpha: number,
    outro: KeysOutro | null,
    at: number,
  ): void {
    const ctx = this.ctx;
    let grow = 1;
    if (outro?.reason === 'escaped') {
      const k = clamp01((at - outro.startedAt) / outro.durationMs);
      grow = 1 + 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    }
    const r = cell * 0.42 * grow;
    const breathe = 1 + 0.06 * Math.sin(now / 320);
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 1.9 * breathe);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(184,146,255,0.75)');
    g.addColorStop(1, 'rgba(184,146,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 1.9 * breathe, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = PORTAL;
    ctx.shadowBlur = cell * 0.8;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, cell * 0.07);
    for (let i = 0; i < 3; i++) {
      const color = i === 1 ? '#ffffff' : i === 0 ? COLORS.p1 : COLORS.p2;
      const speed = (i % 2 === 0 ? 1 : -1) * (1.6 + i * 0.5);
      const start = (now / 1000) * speed + (i * Math.PI * 2) / 3;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * (0.55 + i * 0.22), start, start + Math.PI * 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Плита: кольцо цвета владельца двери; закрытая дверь — плита «дышит», открытая — залита. */
  private drawPlate(
    c: Point,
    cell: number,
    d: Door,
    alpha: number,
    gameNow: number,
    now: number,
  ): void {
    const ctx = this.ctx;
    const color = COLORS[d.owner];
    const r = cell * 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (d.open) {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // Волна в момент нажатия.
      const age = d.openedAtMs === null ? Infinity : gameNow - d.openedAtMs;
      if (age < DOOR_FADE_MS) {
        const k = age / DOOR_FADE_MS;
        ctx.globalAlpha = alpha * (1 - k);
        ctx.lineWidth = Math.max(2, cell * 0.12 * (1 - k));
        ctx.beginPath();
        ctx.arc(c.x, c.y, r * (1 + k * 2.5), 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.shadowColor = color;
      ctx.shadowBlur = cell * (0.3 + 0.4 * pulse);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * (0.35 + 0.35 * pulse);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Дверь: толстая планка поперёк прохода с замком; открытая — створки разъезжаются и гаснут. */
  private drawDoor(
    state: KeysState,
    d: Door,
    cell: number,
    ox: number,
    oy: number,
    alpha: number,
    gameNow: number,
  ): void {
    const ctx = this.ctx;
    const g = doorGeometry(state.maze.width, d);
    const cx = ox + g.x * cell;
    const cy = oy + g.y * cell;
    const color = COLORS[d.owner];
    const len = cell * 0.9;
    const thick = Math.max(4, cell * 0.24);
    const age = d.open ? (d.openedAtMs === null ? Infinity : gameNow - d.openedAtMs) : -1;
    const k = age < 0 ? 0 : clamp01(age / DOOR_FADE_MS);

    ctx.save();
    // Косяки остаются и после открытия — ориентир в лабиринте.
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = color;
    for (const s of [-1, 1]) {
      const px = g.vertical ? cx : cx + (s * len) / 2;
      const py = g.vertical ? cy + (s * len) / 2 : cy;
      ctx.beginPath();
      ctx.arc(px, py, thick * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    if (k >= 1) {
      ctx.restore();
      return;
    }

    // Створки: при открытии разъезжаются к косякам и гаснут.
    const ease = 1 - (1 - k) ** 3;
    const half = (len / 2) * (1 - ease);
    ctx.globalAlpha = alpha * (1 - ease);
    ctx.shadowColor = color;
    ctx.shadowBlur = cell * 0.5;
    ctx.fillStyle = color;
    for (const s of [-1, 1]) {
      const end = (s * len) / 2;
      const inner = end - s * half;
      const a = Math.min(end, inner);
      const b = Math.max(end, inner);
      ctx.beginPath();
      if (g.vertical) ctx.roundRect(cx - thick / 2, cy + a, thick, b - a, thick / 3);
      else ctx.roundRect(cx + a, cy - thick / 2, b - a, thick, thick / 3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Замок по центру: кружок цвета двери с тёмным навесным замком.
    const lr = cell * 0.2 * (1 + ease * 0.6);
    ctx.globalAlpha = alpha * (1 - ease);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.strokeStyle = COLORS.bg;
    ctx.lineWidth = Math.max(1, lr * 0.22);
    const bw = lr * 0.9;
    const bh = lr * 0.68;
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, cy - bh * 0.15, bw, bh, lr * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - bh * 0.15, bw * 0.3, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  private drawDot(
    c: Point,
    cell: number,
    color: string,
    pulse: boolean,
    now: number,
    scale: number,
  ): void {
    const ctx = this.ctx;
    const r = cell * 0.3 * scale;
    if (r <= 0.5) return;
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

  /** Подсказка в начале раунда и «Дверь открыта» при открытии. */
  private drawToasts(state: KeysState, gameNow: number, oy: number, cell: number): void {
    let text: string | null = null;
    let color: string = COLORS.fg;
    let alpha = 0;
    const opened = state.doors
      .filter((d) => d.openedAtMs !== null && gameNow - d.openedAtMs < 1600)
      .sort((a, b) => (b.openedAtMs as number) - (a.openedAtMs as number))[0];
    if (opened) {
      const age = gameNow - (opened.openedAtMs as number);
      text = opened.owner === this.options.you ? 'Ваша дверь открыта!' : 'Дверь напарника открыта!';
      color = COLORS[opened.owner];
      alpha = clamp01(age / 150) * clamp01((1600 - age) / 400);
    } else if (state.elapsedMs < HINT_MS && state.doors.length > 0) {
      text = 'Плиты цвета напарника открывают его двери — подскажите, где они';
      alpha = clamp01((HINT_MS - state.elapsedMs) / 800);
    }
    if (!text || alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '600 15px -apple-system, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 32;
    const h = 32;
    const x = this.cssW / 2;
    const y = oy + Math.max(cell, 24) + h / 2;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = COLORS.bg;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  private drawHud(state: KeysState): void {
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
      ctx.fillText(this.options.names[id], align === 'left' ? x + 24 : x - 24, midY);
    };
    label('p1', 'left');
    label('p2', 'right');

    const cx = this.cssW / 2;
    const remaining = state.config.timeLimitMs - state.elapsedMs;
    ctx.textAlign = 'right';
    ctx.font = '700 24px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = remaining <= 30_000 ? COLORS.danger : COLORS.fg;
    ctx.fillText(formatCountdown(remaining), cx - 14, midY);

    // Счётчик дверей справа от таймера.
    const total = state.doors.length;
    const opened = state.doors.filter((d) => d.open).length;
    ctx.fillStyle = COLORS.muted;
    ctx.fillRect(cx, midY - 12, 1, 24);
    ctx.textAlign = 'left';
    ctx.font = '600 17px -apple-system, "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = total > 0 && opened === total ? PORTAL : COLORS.fg;
    ctx.fillText(`Двери ${opened}/${total}`, cx + 14, midY);
  }

  private getWallsPath(seed: number, m: maze.Maze, cell: number, ox: number, oy: number): Path2D {
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
