// Финал раунда «Ключа и двери»: побег — точки по спирали ныряют в портал, вспышка,
// конфетти двух цветов, туман рассеивается; время вышло — затемнение и надпись.
import { easeOutCubic } from '../maze/outro';

export interface Point {
  x: number;
  y: number;
}

export const ESCAPE_OUTRO_MS = 1800;
export const TIMEOUT_OUTRO_MS = 1000;
/** Доля анимации побега, за которую точки ныряют в портал (дальше — вспышка). */
export const DIVE = 0.55;
const CONFETTI = 64;

interface Confetti {
  angle: number;
  speed: number;
  size: number;
  spin: number;
  color: 'p1' | 'p2';
}

export interface KeysOutro {
  reason: 'escaped' | 'timeout';
  startedAt: number;
  durationMs: number;
  confetti: Confetti[];
}

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export function createKeysOutro(reason: 'escaped' | 'timeout', startedAt: number): KeysOutro {
  const confetti: Confetti[] = [];
  if (reason === 'escaped') {
    for (let i = 0; i < CONFETTI; i++) {
      confetti.push({
        angle: (i / CONFETTI) * Math.PI * 2 + Math.random() * 0.3,
        speed: 0.5 + Math.random(),
        size: 0.08 + Math.random() * 0.1,
        spin: (Math.random() - 0.5) * 14,
        color: i % 2 === 0 ? 'p1' : 'p2',
      });
    }
  }
  return {
    reason,
    startedAt,
    durationMs: reason === 'escaped' ? ESCAPE_OUTRO_MS : TIMEOUT_OUTRO_MS,
    confetti,
  };
}

export function outroProgress(o: KeysOutro, now: number): number {
  return clamp01((now - o.startedAt) / o.durationMs);
}

/** Насколько рассеялся туман: 0 — как был, 1 — нет. */
export function fogLift(o: KeysOutro, now: number): number {
  return easeOutCubic(clamp01(outroProgress(o, now) * 1.5));
}

/**
 * Позиция точки (в клетках) при нырянии в портал: отлетает на орбиту и по спирали
 * уходит в центр портала. side — сторона орбиты (p1 и p2 напротив друг друга).
 * Возвращает null, когда точка уже внутри.
 */
export function divePos(
  o: KeysOutro,
  from: Point,
  portal: Point,
  side: 0 | 1,
  now: number,
): { p: Point; scale: number } | null {
  if (o.reason !== 'escaped') return { p: from, scale: 1 };
  const k = clamp01(outroProgress(o, now) / DIVE);
  if (k >= 1) return null;
  // Откуда начинаем: текущая позиция точки относительно портала.
  const startR = Math.hypot(from.x - portal.x, from.y - portal.y);
  const startA = startR > 0.05 ? Math.atan2(from.y - portal.y, from.x - portal.x) : side * Math.PI;
  const r = (startR * (1 - k) + 0.85 * Math.sin(Math.PI * k)) * (1 - k * k);
  const a = startA + easeOutCubic(k) * Math.PI * 3;
  return {
    p: { x: portal.x + Math.cos(a) * r, y: portal.y + Math.sin(a) * r },
    scale: 1 - k * k * 0.85,
  };
}

export interface OutroDrawContext {
  ctx: CanvasRenderingContext2D;
  /** Центр портала в пикселях. */
  portal: Point;
  cell: number;
  width: number;
  height: number;
  colors: { p1: string; p2: string; fg: string; bg: string };
}

/** Эффекты финала поверх поля (точки и портал рисует рендерер). */
export function drawKeysOutro(o: KeysOutro, now: number, d: OutroDrawContext): void {
  const { ctx, cell, portal } = d;
  const k = outroProgress(o, now);
  ctx.save();

  if (o.reason === 'escaped') {
    const burst = clamp01((k - DIVE) / (1 - DIVE));
    if (k >= DIVE) {
      // Вспышка портала.
      const flash = clamp01(1 - burst * 4);
      if (flash > 0) {
        ctx.globalAlpha = 0.45 * flash;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, d.width, d.height);
      }
      // Ударная волна.
      const wave = easeOutCubic(clamp01(burst / 0.7));
      ctx.globalAlpha = 0.8 * (1 - wave);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, cell * 0.2 * (1 - wave));
      ctx.beginPath();
      ctx.arc(portal.x, portal.y, cell * (0.5 + wave * 6), 0, Math.PI * 2);
      ctx.stroke();

      // Конфетти: разлетаются из портала и падают.
      const t = (burst * (o.durationMs * (1 - DIVE))) / 1000;
      ctx.globalAlpha = clamp01(1.4 - burst);
      for (const c of o.confetti) {
        const vx = Math.cos(c.angle) * c.speed * 9;
        const vy = Math.sin(c.angle) * c.speed * 9 - 3;
        const x = portal.x + vx * cell * t * (1 - t * 0.35);
        const y = portal.y + (vy * t + 9 * t * t) * cell;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(c.spin * t);
        ctx.fillStyle = d.colors[c.color];
        const s = Math.max(3, cell * c.size * 2);
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.restore();
      }
    }
  } else {
    ctx.globalAlpha = 0.55 * easeOutCubic(k);
    ctx.fillStyle = d.colors.bg;
    ctx.fillRect(0, 0, d.width, d.height);
  }

  // Подпись по центру.
  const textIn = clamp01((k - (o.reason === 'escaped' ? DIVE : 0.1)) / 0.2);
  if (textIn > 0) {
    const label = o.reason === 'escaped' ? 'Выбрались!' : 'Время вышло';
    const size = Math.round(
      Math.min(64, Math.max(28, cell * 2.2)) * (0.7 + 0.3 * easeOutCubic(textIn)),
    );
    ctx.globalAlpha = textIn;
    ctx.font = `800 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = d.colors.fg;
    // Над порталом (он в центре поля), чтобы не закрывать вспышку.
    ctx.fillText(label, d.width / 2, d.portal.y - Math.max(cell * 2.6, 70));
  }
  ctx.restore();
}
