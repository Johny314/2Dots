// Финал раунда «Трона»: взрыв в точке аварии (вспышка, ударная волна, искры, обломки) цветом
// разбившегося, тряска экрана и подпись. Ничья — взрываются оба. Время вышло — только подпись.
import type { PlayerId } from '@2dots/core';
import { DELTA, type TronStateView } from './types';

export interface Point {
  x: number;
  y: number;
}

export const CRASH_OUTRO_MS = 1200;
export const TIMEOUT_OUTRO_MS = 900;
const SPARKS = 46;
const DEBRIS = 10;

interface Spark {
  angle: number;
  speed: number;
  size: number;
  /** Белая искра среди цветных. */
  hot: boolean;
}

interface Debris {
  angle: number;
  speed: number;
  spin: number;
  length: number;
}

export interface Explosion {
  player: PlayerId;
  /** Точка удара в координатах клеток (центр клетки = x + 0.5). */
  at: Point;
  sparks: Spark[];
  debris: Debris[];
}

export interface Outro {
  startedAt: number;
  durationMs: number;
  explosions: Explosion[];
  label: string;
  /** Цвет подписи: игрок или нейтральный. */
  labelColor: PlayerId | null;
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Точка удара: от центра клетки головы на полклетки по направлению движения. */
export function impactPoint(x: number, y: number, dir: keyof typeof DELTA): Point {
  const [dx, dy] = DELTA[dir];
  return { x: x + 0.5 + dx * 0.5, y: y + 0.5 + dy * 0.5 };
}

function explosion(player: PlayerId, at: Point): Explosion {
  const sparks: Spark[] = [];
  for (let i = 0; i < SPARKS; i++) {
    sparks.push({
      angle: (i / SPARKS) * Math.PI * 2 + Math.random() * 0.5,
      speed: 0.35 + Math.random() * 0.9,
      size: 0.05 + Math.random() * 0.08,
      hot: i % 4 === 0,
    });
  }
  const debris: Debris[] = [];
  for (let i = 0; i < DEBRIS; i++) {
    debris.push({
      angle: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.6,
      spin: (Math.random() - 0.5) * 12,
      length: 0.25 + Math.random() * 0.35,
    });
  }
  return { player, at, sparks, debris };
}

/** null — у state нет результата. */
export function createOutro(state: TronStateView, startedAt: number): Outro | null {
  const r = state.result;
  if (!r) return null;
  if (r.reason === 'timeout') {
    return {
      startedAt,
      durationMs: TIMEOUT_OUTRO_MS,
      explosions: [],
      label: 'Время вышло',
      labelColor: null,
    };
  }
  const explosions: Explosion[] = [];
  for (const id of ['p1', 'p2'] as const) {
    const p = state.players[id];
    if (p.alive) continue;
    explosions.push(explosion(id, impactPoint(p.x, p.y, p.dir)));
  }
  const both = explosions.length > 1;
  return {
    startedAt,
    durationMs: CRASH_OUTRO_MS,
    explosions,
    label: both ? 'Столкновение!' : 'Крушение!',
    labelColor: both ? null : (explosions[0]?.player ?? null),
  };
}

export function outroProgress(o: Outro, now: number): number {
  return clamp01((now - o.startedAt) / o.durationMs);
}

/** Сдвиг экрана для тряски (в пикселях). */
export function shakeOffset(o: Outro, now: number, cell: number): Point {
  if (o.explosions.length === 0) return { x: 0, y: 0 };
  const k = outroProgress(o, now);
  const amp = cell * 0.45 * (1 - clamp01(k / 0.45)) ** 2;
  if (amp <= 0.05) return { x: 0, y: 0 };
  const t = now / 16;
  return { x: Math.sin(t * 2.1) * amp, y: Math.cos(t * 2.9) * amp };
}

/** Видна ли ещё голова разбившегося игрока (исчезает во вспышке). */
export function headVisible(o: Outro, player: PlayerId, now: number): boolean {
  return !o.explosions.some((e) => e.player === player) || outroProgress(o, now) < 0.04;
}

export interface OutroDrawContext {
  ctx: CanvasRenderingContext2D;
  /** Координаты клеток → пиксели. */
  toPx(p: Point): Point;
  cell: number;
  width: number;
  height: number;
  colors: { p1: string; p2: string; fg: string };
}

export function drawOutro(o: Outro, now: number, d: OutroDrawContext): void {
  const { ctx, cell } = d;
  const k = outroProgress(o, now);
  ctx.save();

  // Вспышка на весь экран в первый миг.
  if (o.explosions.length > 0 && k < 0.12) {
    ctx.globalAlpha = 0.28 * (1 - k / 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, d.width, d.height);
  }

  for (const e of o.explosions) {
    const c = d.toPx(e.at);
    const color = d.colors[e.player];
    ctx.globalCompositeOperation = 'lighter';

    // Огненный шар: быстро раздувается и гаснет.
    const ball = clamp01(k / 0.35);
    if (ball < 1) {
      const r = cell * (0.6 + easeOutCubic(ball) * 2.6);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * (1 - ball)})`);
      g.addColorStop(0.35, withAlpha(color, 0.8 * (1 - ball)));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ударные волны: две, вторая с задержкой.
    for (let i = 0; i < 2; i++) {
      const t = clamp01((k - i * 0.12) / 0.7);
      if (t <= 0 || t >= 1) continue;
      ctx.globalAlpha = 0.9 * (1 - t);
      ctx.strokeStyle = i === 0 ? '#ffffff' : color;
      ctx.lineWidth = Math.max(1.5, cell * 0.28 * (1 - t));
      ctx.shadowColor = color;
      ctx.shadowBlur = cell * 0.8;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cell * (0.4 + easeOutCubic(t) * (6 - i * 1.5)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Искры: разлетаются и тормозят.
    const fly = easeOutCubic(clamp01(k / 0.85));
    const fade = 1 - clamp01((k - 0.35) / 0.65);
    for (const s of e.sparks) {
      const r = cell * (0.2 + fly * 4.2 * s.speed);
      const x = c.x + Math.cos(s.angle) * r;
      const y = c.y + Math.sin(s.angle) * r;
      const tail = cell * 0.5 * s.speed * (1 - fly);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = s.hot ? '#ffffff' : color;
      ctx.lineWidth = Math.max(1.2, cell * s.size);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(s.angle) * tail, y - Math.sin(s.angle) * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Обломки мотоцикла: вращающиеся отрезки.
    ctx.globalCompositeOperation = 'source-over';
    for (const b of e.debris) {
      const r = cell * (0.3 + fly * 2.4 * b.speed);
      const x = c.x + Math.cos(b.angle) * r;
      const y = c.y + Math.sin(b.angle) * r;
      const a = b.angle + b.spin * fly;
      const half = (cell * b.length) / 2;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, cell * 0.12);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * half, y - Math.sin(a) * half);
      ctx.lineTo(x + Math.cos(a) * half, y + Math.sin(a) * half);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // Подпись по центру.
  const textIn = clamp01((k - (o.explosions.length > 0 ? 0.15 : 0.05)) / 0.2);
  if (textIn > 0) {
    const size = Math.round(
      Math.min(64, Math.max(28, cell * 2.4)) * (0.7 + 0.3 * easeOutCubic(textIn)),
    );
    ctx.globalAlpha = textIn;
    ctx.font = `800 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = o.labelColor ? d.colors[o.labelColor] : 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = d.colors.fg;
    ctx.fillText(o.label, d.width / 2, d.height / 2);
  }

  ctx.restore();
}

/** '#rrggbb' + альфа → rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
