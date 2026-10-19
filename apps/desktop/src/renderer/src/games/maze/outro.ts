// Финальная анимация раунда: точки слетаются, вспышка, кольца и искры; туман рассеивается
// и показывает, какие клетки исследовал каждый (это и есть счёт).

export interface Point {
  x: number;
  y: number;
}

export const MEET_OUTRO_MS = 1900;
export const TIMEOUT_OUTRO_MS = 1100;
/** Доля анимации, за которую точки слетаются в точку встречи. */
const GATHER = 0.3;
const PARTICLES = 40;

interface Particle {
  angle: number;
  speed: number;
  size: number;
  color: 'p1' | 'p2';
}

export interface Outro {
  reason: 'met' | 'timeout';
  startedAt: number;
  durationMs: number;
  /** Точка встречи в координатах клеток (между двумя точками). */
  meet: Point;
  particles: Particle[];
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export function createOutro(
  reason: 'met' | 'timeout',
  startedAt: number,
  a: Point,
  b: Point,
): Outro {
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLES; i++) {
    particles.push({
      angle: (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.4,
      speed: 0.6 + Math.random() * 0.9,
      size: 0.05 + Math.random() * 0.07,
      color: i % 2 === 0 ? 'p1' : 'p2',
    });
  }
  return {
    reason,
    startedAt,
    durationMs: reason === 'met' ? MEET_OUTRO_MS : TIMEOUT_OUTRO_MS,
    meet: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    particles,
  };
}

/** Прогресс 0..1. */
export function outroProgress(o: Outro, now: number): number {
  return clamp01((now - o.startedAt) / o.durationMs);
}

/** Насколько рассеялся туман (0 — как был, 1 — нет тумана). */
export function fogLift(o: Outro, now: number): number {
  return easeOutCubic(clamp01(outroProgress(o, now) * 1.6));
}

/** Позиция точки во время анимации: слетается от from к точке встречи. */
export function gatherPos(o: Outro, from: Point, now: number): Point {
  if (o.reason !== 'met') return from;
  const k = easeOutCubic(clamp01(outroProgress(o, now) / GATHER));
  return { x: from.x + (o.meet.x - from.x) * k, y: from.y + (o.meet.y - from.y) * k };
}

/** Точки уже слились в одну. */
export function merged(o: Outro, now: number): boolean {
  return o.reason === 'met' && outroProgress(o, now) >= GATHER;
}

export interface OutroDrawContext {
  ctx: CanvasRenderingContext2D;
  /** Центр клетки (дробные координаты клеток) → пиксели. */
  center(p: Point): Point;
  cell: number;
  width: number;
  height: number;
  colors: { p1: string; p2: string; fg: string };
}

/** Рисует эффекты встречи поверх лабиринта (точки рисует рендерер). */
export function drawOutroEffects(o: Outro, now: number, d: OutroDrawContext): void {
  const { ctx, cell } = d;
  const k = outroProgress(o, now);
  ctx.save();

  if (o.reason === 'met') {
    const c = d.center(o.meet);
    const burst = clamp01((k - GATHER) / (1 - GATHER));
    if (k >= GATHER) {
      // Вспышка в момент слияния.
      const flash = clamp01(1 - burst * 5);
      if (flash > 0) {
        ctx.globalAlpha = 0.35 * flash;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, d.width, d.height);
      }

      // Кольца цветов игроков, расходящиеся по очереди.
      for (let i = 0; i < 3; i++) {
        const t = clamp01((burst - i * 0.14) / 0.6);
        if (t <= 0 || t >= 1) continue;
        ctx.globalAlpha = 0.85 * (1 - t);
        ctx.strokeStyle = i % 2 === 0 ? d.colors.p1 : d.colors.p2;
        ctx.lineWidth = Math.max(2, cell * 0.16 * (1 - t));
        ctx.beginPath();
        ctx.arc(c.x, c.y, cell * (0.4 + easeOutCubic(t) * 4.5), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Искры.
      const spark = easeOutCubic(clamp01(burst / 0.8));
      ctx.globalAlpha = clamp01(1 - burst);
      for (const p of o.particles) {
        const r = cell * (0.3 + spark * 3.2 * p.speed);
        ctx.fillStyle = d.colors[p.color];
        ctx.beginPath();
        ctx.arc(
          c.x + Math.cos(p.angle) * r,
          c.y + Math.sin(p.angle) * r,
          Math.max(1.5, cell * p.size),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Слившаяся точка: пульсирует бело-розово-голубым.
      const pulse = 1 + 0.18 * Math.sin(now / 90);
      ctx.globalAlpha = 1;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = cell * 1.4;
      const grad = ctx.createLinearGradient(c.x - cell * 0.4, c.y, c.x + cell * 0.4, c.y);
      grad.addColorStop(0, d.colors.p1);
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(1, d.colors.p2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cell * 0.38 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // Подпись по центру поля.
  const textIn = clamp01((k - (o.reason === 'met' ? GATHER : 0.1)) / 0.2);
  if (textIn > 0) {
    const label = o.reason === 'met' ? 'Встреча!' : 'Время вышло';
    const size = Math.round(
      Math.min(64, Math.max(28, cell * 2.2)) * (0.7 + 0.3 * easeOutCubic(textIn)),
    );
    ctx.globalAlpha = textIn;
    ctx.font = `800 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = d.colors.fg;
    ctx.fillText(label, d.width / 2, d.height / 2);
  }

  ctx.restore();
}
