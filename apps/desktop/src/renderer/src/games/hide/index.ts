// «Прятки» на стороне renderer: рендерер лабиринта + след прячущегося, подсказка, роль и фора.
import { hide, type maze, type PlayerId } from '@2dots/core';
import { ARROWS, createKeyInput, WASD } from '../maze/input';
import { COLORS, MazeRenderer, type DecorateApi, type MazeDecorator } from '../maze/renderer';
import type { GameModule, MountGameView } from '../types';
import { HIDE_SETTINGS } from './settings';
import { summarizeHide } from './summary';

type HideState = hide.HideState;

/** Клавиши подсказки (искатель). */
const HINT_KEYS = new Set(['KeyH', 'Space', 'KeyE']);
const FOOTER_HEIGHT = 34;
const FONT = '-apple-system, "Segoe UI", system-ui, sans-serif';

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** HideState → MazeState для рендерера лабиринта (найден = встреча). */
function toMazeView(s: HideState): maze.MazeState {
  const { config } = s;
  const r = s.result;
  return {
    seed: s.seed,
    config: {
      width: config.width,
      height: config.height,
      speedCellsPerSec: config.speedCellsPerSec,
      fogRadius: config.fogRadius,
      hotCold: config.hotCold,
      timeLimitMs: config.timeLimitMs,
      scoring: 'distinct',
      braid: config.braid,
    },
    maze: s.maze,
    tick: s.tick,
    elapsedMs: s.elapsedMs,
    players: s.players,
    result: r && {
      winner: r.winner,
      reason: r.reason === 'found' ? 'met' : 'timeout',
      scores: { p1: 0, p2: 0 },
      meetCell: r.foundCell,
      pathLength: 0,
      scoring: 'distinct',
      totalCells: config.width * config.height,
    },
  };
}

function decorator(you: PlayerId, current: () => HideState | null): MazeDecorator {
  return {
    board(api) {
      const s = current();
      if (!s || api.outro) return;
      const hider = s.hider;
      const seeking = !hide.isHeadStart(s);
      const color = COLORS[hider];
      const { ctx, cell } = api;

      // След прячущегося: искатель видит его сквозь туман, прячущийся — свой, бледнее.
      if (seeking || you === hider) {
        const n = s.trail.length;
        const base = you === hider ? 0.35 : 0.75;
        s.trail.forEach((i, k) => {
          const c = api.center({ x: i % s.maze.width, y: Math.floor(i / s.maze.width) });
          ctx.globalAlpha = base * (0.25 + 0.75 * ((k + 1) / n));
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(c.x, c.y, cell * 0.14, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // Подсказка: пульсирующая область, где прячущийся.
      const hint = s.hint;
      if (hint) {
        const pulse = 0.5 + 0.5 * Math.sin(api.now / 120);
        const x0 = Math.max(0, hint.x - hint.radius);
        const y0 = Math.max(0, hint.y - hint.radius);
        const x1 = Math.min(s.maze.width - 1, hint.x + hint.radius);
        const y1 = Math.min(s.maze.height - 1, hint.y + hint.radius);
        const px = api.ox + x0 * cell;
        const py = api.oy + y0 * cell;
        const w = (x1 - x0 + 1) * cell;
        const h = (y1 - y0 + 1) * cell;
        ctx.save();
        ctx.fillStyle = rgba(color, 0.12 + 0.12 * pulse);
        ctx.fillRect(px, py, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([cell * 0.4, cell * 0.25]);
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * pulse;
        ctx.strokeRect(px, py, w, h);
        ctx.restore();
      }

      // Фора: искатель «зажмурился» — поле затемнено, крупный отсчёт.
      if (!seeking && you !== hider) {
        const left = Math.ceil((s.config.headStartMs - s.elapsedMs) / 1000);
        const bw = s.maze.width * cell;
        const bh = s.maze.height * cell;
        ctx.save();
        ctx.fillStyle = 'rgba(14, 15, 26, 0.82)';
        ctx.fillRect(api.ox, api.oy, bw, bh);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COLORS.fg;
        ctx.font = `700 ${Math.round(cell * 2.4)}px ${FONT}`;
        ctx.fillText(String(left), api.ox + bw / 2, api.oy + bh / 2 - cell);
        ctx.font = `600 ${Math.max(14, Math.round(cell * 0.7))}px ${FONT}`;
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(
          'Соперник прячется — не подглядывайте!',
          api.ox + bw / 2,
          api.oy + bh / 2 + cell,
        );
        ctx.restore();
      }
    },
    overlay(api) {
      const s = current();
      if (!s || api.outro) return;
      drawFooter(api, s, you);
    },
  };
}

/** Подпись под полем: роль и что сейчас важно. */
function drawFooter(api: DecorateApi, s: HideState, you: PlayerId): void {
  const { ctx } = api;
  const hiding = you === s.hider;
  const headStart = hide.isHeadStart(s);
  const left = Math.ceil((s.config.headStartMs - s.elapsedMs) / 1000);
  let status: string;
  if (hiding) {
    status = headStart
      ? `искатель выйдет через ${left} с`
      : s.hint
        ? 'вас засветили — бегите!'
        : s.trail.length > 0
          ? 'за вами след — замрите, чтобы он пропал'
          : 'след пропал — вас не видно';
  } else {
    const dots = '●'.repeat(s.hintsLeft) + '○'.repeat(Math.max(0, s.config.hints - s.hintsLeft));
    status = headStart
      ? `ждите ${left} с`
      : s.hintsLeft > 0
        ? `подсказки ${dots} — H или Пробел`
        : `подсказки ${dots} — закончились`;
  }
  const role = hiding ? 'Вы прячетесь' : 'Вы ищете';
  const y = api.height - FOOTER_HEIGHT / 2 - 4;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `700 15px ${FONT}`;
  const roleW = ctx.measureText(role).width;
  ctx.font = `500 15px ${FONT}`;
  const text = ` · ${status}`;
  const statusW = ctx.measureText(text).width;
  const x = (api.width - roleW - statusW) / 2;
  ctx.textAlign = 'left';
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = COLORS[you];
  ctx.fillText(role, x, y);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(text, x + roleW, y);
  ctx.restore();
}

export const mountHideView: MountGameView = (canvas, { you, names, match, onInput }) => {
  let cur: HideState | null = null;
  const renderer = new MazeRenderer(canvas, {
    you,
    names,
    match,
    fog: true,
    decorate: decorator(you, () => cur),
    footerHeight: FOOTER_HEIGHT,
  });
  let dir: maze.Dir | null = null;
  const input = createKeyInput({ ...WASD, ...ARROWS }, (next) => {
    dir = next;
    const msg: hide.HideInput = { dir };
    onInput(msg);
  });
  const onKeyDown = (e: KeyboardEvent) => {
    if (!HINT_KEYS.has(e.code) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const msg: hide.HideInput = { dir, hint: true };
    onInput(msg);
  };
  window.addEventListener('keydown', onKeyDown);
  return {
    update(state) {
      cur = state as HideState;
      renderer.update(toMazeView(cur));
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      input.destroy();
      renderer.destroy();
    },
    outroMs() {
      return renderer.outroRemainingMs();
    },
  };
};

export const hideModule: GameModule = {
  mount: mountHideView,
  summarize: summarizeHide,
  settings: HIDE_SETTINGS,
  countdownCaption(seed, config, you) {
    const roles = (config as Partial<hide.HideConfig> | null)?.roles ?? 'random';
    return hide.hiderOf(seed, roles) === you ? 'Прятки · вы прячетесь' : 'Прятки · вы ищете';
  },
};
