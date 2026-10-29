// Canvas 2D рендерер «Трона»: тёмная арена с сеткой, неоновые следы со свечением, головы
// с интерполяцией между шагами, HUD и взрыв в финале.
//
// След рисуется в два offscreen-слоя (свечение и яркая сердцевина) инкрементально: за кадр
// дорисовываются только новые клетки. Слои пересобираются при смене размера или нового раунда.
import { PLAYER_IDS, type PlayerId } from '@2dots/core';
import { COLORS } from '../maze/renderer';
import {
  createOutro,
  drawOutro,
  headVisible,
  shakeOffset,
  withAlpha,
  type Outro,
  type Point,
} from './outro';
import { DELTA, speedAt, type Dir, type TronStateView } from './types';

const HUD_HEIGHT = 56;
const PADDING = 20;
const OWNER: Record<PlayerId, number> = { p1: 1, p2: 2 };
/** Светлая сердцевина следа — цвет игрока, разбавленный белым. */
const CORE: Record<PlayerId, string> = { p1: '#ffd0df', p2: '#d4f5ff' };
const ARENA_BG = '#080913';

export interface TronRendererOptions {
  you: PlayerId | null;
  names: Record<PlayerId, string>;
  match: Record<PlayerId, number> | null;
}

interface Swing {
  cell: number;
  /** Где была голова (в клетках арены) в момент нажатия. */
  from: Point;
  fromFrac: number;
}

interface Layout {
  cell: number;
  ox: number;
  oy: number;
  dpr: number;
  key: string;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function makeLayer(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');
  return { canvas, ctx };
}

export class TronRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private cssW = 0;
  private cssH = 0;

  private cur: TronStateView | null = null;
  private curAt = 0;
  private outro: Outro | null = null;

  // Offscreen-слои следа.
  private readonly glow = makeLayer();
  private readonly core = makeLayer();
  private layerKey = '';
  private painted = new Uint8Array(0);
  /**
   * Поворот, нажатый посреди шага: голова уже уехала прямо — плавно уводим её от того места
   * в новое направление к концу шага, без скачка вбок.
   */
  private swing: Record<PlayerId, Swing | null> = { p1: null, p2: null };
  /** Последнее нарисованное положение головы (в клетках арены). */
  private lastHead: Record<PlayerId, Point | null> = { p1: null, p2: null };
  /** Порядок, в котором головы проходили клетки (для соединённых линий при пересборке). */
  private paths: Record<PlayerId, number[]> = { p1: [], p2: [] };
  private gridPath: Path2D | null = null;
  private gridKey = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private options: TronRendererOptions,
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

  update(state: TronStateView): void {
    const now = performance.now();
    const prev = this.cur;
    if (!prev || prev.seed !== state.seed || state.tick < prev.tick) {
      // Новый раунд: всё заново.
      this.outro = null;
      this.paths = { p1: [], p2: [] };
      this.swing = { p1: null, p2: null };
      this.lastHead = { p1: null, p2: null };
      this.layerKey = '';
    }
    const w0 = state.config.width;
    for (const id of PLAYER_IDS) {
      const p = state.players[id];
      const cell = p.y * w0 + p.x;
      const was = prev?.players[id];
      const sameStep = was !== undefined && was.y * w0 + was.x === cell;
      const planned = p.queue[0] ?? p.dir;
      const wasPlanned = was ? (was.queue[0] ?? was.dir) : planned;
      if (!sameStep) {
        this.swing[id] = null;
      } else if (planned !== wasPlanned && state.progress > 0) {
        const from = this.lastHead[id];
        this.swing[id] = from ? { cell, from, fromFrac: state.progress } : null;
      }
    }
    this.cur = state;
    this.curAt = now;
    const w = state.config.width;
    for (const id of PLAYER_IDS) {
      const p = state.players[id];
      const path = this.paths[id];
      const i = p.y * w + p.x;
      if (path[path.length - 1] !== i) path.push(i);
    }
    if (state.result && !this.outro) this.outro = createOutro(state, now);
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
    if (this.cur) this.draw(this.cur, dpr, now);
  };

  private layout(state: TronStateView, dpr: number): Layout {
    const { width, height } = state.config;
    const availW = this.cssW - PADDING * 2;
    const availH = this.cssH - HUD_HEIGHT - PADDING * 2;
    const cell = Math.max(4, Math.floor(Math.min(availW / width, availH / height)));
    const ox = Math.round((this.cssW - cell * width) / 2);
    const oy = Math.round(HUD_HEIGHT + PADDING + (availH - cell * height) / 2);
    return { cell, ox, oy, dpr, key: `${state.seed}:${width}x${height}:${cell}:${dpr}` };
  }

  private draw(state: TronStateView, dpr: number, now: number): void {
    const ctx = this.ctx;
    const L = this.layout(state, dpr);
    const { cell } = L;
    const { width, height, wrap } = state.config;
    const aw = cell * width;
    const ah = cell * height;
    this.syncLayers(state, L);

    const outro = this.outro;
    const shake = outro ? shakeOffset(outro, now, cell) : { x: 0, y: 0 };
    const ox = L.ox + shake.x;
    const oy = L.oy + shake.y;
    const toPx = (p: Point): Point => ({ x: ox + p.x * cell, y: oy + p.y * cell });

    // Арена: фон, сетка, рамка (пунктир — края сквозные).
    ctx.save();
    ctx.fillStyle = ARENA_BG;
    ctx.fillRect(ox, oy, aw, ah);
    ctx.translate(ox, oy);
    ctx.strokeStyle = 'rgba(120, 130, 220, 0.07)';
    ctx.lineWidth = 1;
    ctx.stroke(this.getGrid(width, height, cell));
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = COLORS.wall;
    ctx.shadowColor = '#6f78ff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    if (wrap) ctx.setLineDash([cell * 0.6, cell * 0.4]);
    ctx.strokeRect(ox - 1, oy - 1, aw + 2, ah + 2);
    ctx.restore();

    // След из offscreen-слоёв.
    ctx.drawImage(this.glow.canvas, ox - cell, oy - cell, aw + cell * 2, ah + cell * 2);
    ctx.drawImage(this.core.canvas, ox - cell, oy - cell, aw + cell * 2, ah + cell * 2);

    // Головы: от центра клетки на долю шага вперёд (плавное движение между шагами).
    const sinceUpdate = state.result ? 0 : (now - this.curAt) / 1000;
    const frac = Math.min(
      0.95,
      state.progress + speedAt(state.config.accelerate, state.elapsedMs) * sinceUpdate,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, aw, ah);
    ctx.clip();
    for (const id of PLAYER_IDS) {
      const p = state.players[id];
      if (outro && !headVisible(outro, id, now)) continue;
      const dir = state.result ? p.dir : (p.queue[0] ?? p.dir);
      const f = state.result ? (p.alive ? 0 : 0.5) : frac;
      const ahead = (d: Dir): Point => {
        const [dx, dy] = DELTA[d];
        // У края без сквозных краёв голова упирается в рамку; со сквозными — не вылезает за неё.
        const nx = p.x + dx;
        const ny = p.y + dy;
        const g = nx < 0 || ny < 0 || nx >= width || ny >= height ? Math.min(f, 0.5) : f;
        return { x: p.x + 0.5 + dx * g, y: p.y + 0.5 + dy * g };
      };
      let at = ahead(dir);
      const swing = this.swing[id];
      if (!state.result && swing && swing.cell === p.y * width + p.x) {
        // Плавный увод: в момент нажатия — там, где голова уже была, к концу шага — на новом пути.
        const k = Math.min(
          1,
          Math.max(0, (f - swing.fromFrac) / Math.max(0.05, 1 - swing.fromFrac)),
        );
        const e = k * k * (3 - 2 * k);
        const { from: s0 } = swing;
        at = { x: s0.x + (at.x - s0.x) * e, y: s0.y + (at.y - s0.y) * e };
      }
      this.lastHead[id] = at;
      const from = toPx({ x: p.x + 0.5, y: p.y + 0.5 });
      const head = toPx(at);
      this.strokeTrail(ctx, id, from, head, cell, dpr);
      this.drawHead(head, cell, id, id === this.options.you && !outro, now);
    }
    ctx.restore();

    if (outro) {
      drawOutro(outro, now, {
        ctx,
        toPx,
        cell,
        width: this.cssW,
        height: this.cssH,
        colors: { p1: COLORS.p1, p2: COLORS.p2, fg: COLORS.fg },
      });
    }

    this.drawHud(state);
  }

  /** Отрезок следа (свечение + сердцевина) в текущих координатах ctx. */
  private strokeTrail(
    ctx: CanvasRenderingContext2D,
    id: PlayerId,
    a: Point,
    b: Point,
    cell: number,
    dpr: number,
  ): void {
    ctx.save();
    ctx.lineCap = 'square';
    ctx.strokeStyle = COLORS[id];
    ctx.shadowColor = COLORS[id];
    ctx.shadowBlur = cell * 0.9 * dpr;
    ctx.lineWidth = cell * 0.42;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = CORE[id];
    ctx.lineWidth = cell * 0.14;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Слои следа в пикселях устройства, с полем в одну клетку вокруг арены (под свечение).
   * Пересобираются по ключу раскладки; иначе дорисовываются только новые клетки.
   */
  private syncLayers(state: TronStateView, L: Layout): void {
    const { width, height } = state.config;
    const { cell, dpr } = L;
    const fresh = this.layerKey !== L.key || this.painted.length !== state.trail.length;
    if (fresh) {
      const pw = Math.round((width + 2) * cell * dpr);
      const ph = Math.round((height + 2) * cell * dpr);
      for (const layer of [this.glow, this.core]) {
        layer.canvas.width = pw;
        layer.canvas.height = ph;
        layer.ctx.setTransform(dpr, 0, 0, dpr, cell * dpr, cell * dpr);
        layer.ctx.lineCap = 'square';
      }
      this.painted = new Uint8Array(state.trail.length);
      this.layerKey = L.key;
    }

    const center = (i: number): Point => ({
      x: ((i % width) + 0.5) * cell,
      y: (Math.floor(i / width) + 0.5) * cell,
    });
    const gctx = this.glow.ctx;
    const cctx = this.core.ctx;

    const segment = (id: PlayerId, from: number, to: number) => {
      // Соседние клетки (в том числе через сквозной край): две половинки до общей границы.
      const fx = from % width;
      const fy = Math.floor(from / width);
      let dx = (to % width) - fx;
      let dy = Math.floor(to / width) - fy;
      if (Math.abs(dx) > 1) dx = -Math.sign(dx);
      if (Math.abs(dy) > 1) dy = -Math.sign(dy);
      if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
      const a = center(from);
      const b = center(to);
      const half = cell / 2;
      for (const [p, s] of [
        [a, 1],
        [b, -1],
      ] as const) {
        const end = { x: p.x + dx * half * s, y: p.y + dy * half * s };
        this.paintLine(gctx, cctx, id, p, end, cell, dpr);
      }
      return true;
    };

    // Соединения по пройденному пути: при пересборке — все, иначе — только новые.
    for (const id of PLAYER_IDS) {
      const path = this.paths[id];
      for (let k = 1; k < path.length; k++) {
        const to = path[k] as number;
        if (!fresh && this.painted[to]) continue;
        if (state.trail[to] !== OWNER[id]) continue;
        segment(id, path[k - 1] as number, to);
      }
    }
    // Все клетки следа, которые ещё не нарисованы (в том числе пропущенные шаги и старт).
    const trail = state.trail;
    for (let i = 0; i < trail.length; i++) {
      const v = trail[i];
      if (v === 0 || this.painted[i]) continue;
      const id: PlayerId = v === 1 ? 'p1' : 'p2';
      const c = center(i);
      this.paintLine(gctx, cctx, id, c, c, cell, dpr);
      this.painted[i] = 1;
    }
  }

  private paintLine(
    gctx: CanvasRenderingContext2D,
    cctx: CanvasRenderingContext2D,
    id: PlayerId,
    a: Point,
    b: Point,
    cell: number,
    dpr: number,
  ): void {
    // Точка — квадратик: у нулевой линии с lineCap='square' браузеры ничего не рисуют.
    const dot = a.x === b.x && a.y === b.y;
    gctx.shadowColor = COLORS[id];
    gctx.shadowBlur = cell * 0.9 * dpr;
    gctx.strokeStyle = COLORS[id];
    gctx.fillStyle = COLORS[id];
    const gw = cell * 0.42;
    if (dot) {
      gctx.fillRect(a.x - gw / 2, a.y - gw / 2, gw, gw);
    } else {
      gctx.lineWidth = gw;
      gctx.beginPath();
      gctx.moveTo(a.x, a.y);
      gctx.lineTo(b.x, b.y);
      gctx.stroke();
    }
    const cw = cell * 0.14;
    cctx.strokeStyle = CORE[id];
    cctx.fillStyle = CORE[id];
    if (dot) {
      cctx.fillRect(a.x - cw / 2, a.y - cw / 2, cw, cw);
    } else {
      cctx.lineWidth = cw;
      cctx.beginPath();
      cctx.moveTo(a.x, a.y);
      cctx.lineTo(b.x, b.y);
      cctx.stroke();
    }
  }

  private getGrid(width: number, height: number, cell: number): Path2D {
    const key = `${width}x${height}:${cell}`;
    if (this.gridPath && key === this.gridKey) return this.gridPath;
    const path = new Path2D();
    for (let x = 1; x < width; x++) {
      path.moveTo(x * cell + 0.5, 0);
      path.lineTo(x * cell + 0.5, height * cell);
    }
    for (let y = 1; y < height; y++) {
      path.moveTo(0, y * cell + 0.5);
      path.lineTo(width * cell, y * cell + 0.5);
    }
    this.gridPath = path;
    this.gridKey = key;
    return path;
  }

  private drawHead(c: Point, cell: number, id: PlayerId, pulse: boolean, now: number): void {
    const ctx = this.ctx;
    const color = COLORS[id];
    const r = cell * 0.36;
    ctx.save();
    const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, cell * 1.4);
    halo.addColorStop(0, withAlpha(color, 0.45));
    halo.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, cell * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = color;
    ctx.shadowBlur = cell * 1.2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cell * 0.1);
    ctx.stroke();
    if (pulse) {
      const k = (now % 1000) / 1000;
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * (1.3 + k * 1.6), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHud(state: TronStateView): void {
    const ctx = this.ctx;
    const midY = HUD_HEIGHT / 2 + 6;
    ctx.save();
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
    ctx.textAlign = 'center';
    ctx.font = '700 24px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = COLORS.fg;
    ctx.fillText(formatTime(state.elapsedMs), cx, midY);

    const match = this.options.match;
    if (match) {
      const gap = 62;
      ctx.font = '700 20px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
      ctx.fillStyle = COLORS.p1;
      ctx.textAlign = 'right';
      ctx.fillText(String(match.p1), cx - gap, midY);
      ctx.fillStyle = COLORS.p2;
      ctx.textAlign = 'left';
      ctx.fillText(String(match.p2), cx + gap, midY);
    }
    ctx.restore();
  }
}
