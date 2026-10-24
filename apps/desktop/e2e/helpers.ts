// Общие помощники e2e: запуск экземпляра приложения и скриншоты.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MAIN = join(import.meta.dirname, '../out/main/index.js');

/**
 * Скриншоты по умолчанию пишутся в gitignored test-results/screenshots/.
 * UPDATE_SCREENSHOTS=1 — в закоммиченные e2e/screenshots/ (обновить снимки в репозитории).
 */
export const SHOTS_DIR =
  process.env.UPDATE_SCREENSHOTS === '1'
    ? join(import.meta.dirname, 'screenshots')
    : join(import.meta.dirname, '../test-results/screenshots');

export function shotPath(name: string): string {
  return join(SHOTS_DIR, `${name}.png`);
}

export async function shot(win: Page, name: string, settleMs = 300): Promise<void> {
  await win.waitForTimeout(settleMs); // дождаться появления экрана (fade-in)
  await win.screenshot({ path: shotPath(name) });
}

export interface LaunchOptions {
  mode?: 'mock' | 'local' | null;
  /** Доп. переменные окружения (TWODOTS_PORT, TWODOTS_E2E…). */
  env?: Record<string, string>;
}

export async function launch(
  opts: LaunchOptions = {},
): Promise<{ app: ElectronApplication; win: Page }> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.TWODOTS_MODE;
  delete env.TWODOTS_E2E;
  delete env.TWODOTS_PORT;
  delete env.TWODOTS_MOCK_UPDATE;
  // Свой профиль на каждый запуск: localStorage (имя, настройки, последняя игра) не протекает между тестами.
  env.TWODOTS_USER_DATA = mkdtempSync(join(tmpdir(), '2dots-e2e-'));
  if (opts.mode) env.TWODOTS_MODE = opts.mode;
  Object.assign(env, opts.env);
  const app = await electron.launch({ args: [MAIN], env });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

export const screen = (win: Page, id: string) => win.getByTestId(`screen-${id}`);

/** Случайный порт для хоста, чтобы параллельные/повторные прогоны не конфликтовали. */
export function randomPort(): number {
  return 20_000 + Math.floor(Math.random() * 20_000);
}
