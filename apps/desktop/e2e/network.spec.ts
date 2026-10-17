// Настоящая сеть: два экземпляра приложения (хост и гость через 127.0.0.1) и приложение против бота.
// Хост слушает порт из TWODOTS_PORT; ввод в лабиринте — тестовый хук autoplay (BFS к сопернику).
import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { launch, randomPort, screen, shot } from './helpers';

const repoRoot = join(import.meta.dirname, '../../..');

async function setAutoplay(win: Page, on: boolean): Promise<void> {
  await win.evaluate((value) => {
    (globalThis as unknown as { __twodots: { autoplay: boolean } }).__twodots.autoplay = value;
  }, on);
}

async function createGame(win: Page, name: string): Promise<void> {
  await expect(screen(win, 'home')).toBeVisible();
  await win.getByTestId('name-input').fill(name);
  await win.getByTestId('create-game').click();
  await expect(screen(win, 'host-wait')).toBeVisible();
  await expect(win.getByTestId('host-status')).toContainText('Ждём подключения', {
    timeout: 10_000,
  });
}

/** Ждёт конца отсчёта 3‑2‑1 и экрана игры. */
async function waitGame(win: Page): Promise<void> {
  await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
}

test.describe.configure({ timeout: 240_000 });

test('два экземпляра: создать → присоединиться → лобби → игра → результат → матч до 3 побед → обрыв', async () => {
  const port = randomPort();
  const host = await launch({ env: { TWODOTS_PORT: String(port), TWODOTS_E2E: '1' } });
  const guest = await launch({ env: { TWODOTS_E2E: '1' } });
  try {
    const hw = host.win;
    const gw = guest.win;

    // Версия в подвале — из package.json приложения, а не версия Electron.
    await expect(hw.getByTestId('mode')).toContainText('версия 0.1.0');

    await createGame(hw, 'Аня');
    await expect(hw.getByTestId('host-ips')).toBeVisible();
    await setAutoplay(hw, true);

    // Гость: «Присоединиться» → ввод IP:порт.
    await gw.getByTestId('name-input').fill('Женя');
    await gw.getByTestId('join-game').click();
    await expect(screen(gw, 'join')).toBeVisible();
    await gw.getByTestId('ip-input').fill(`127.0.0.1:${port}`);
    await gw.getByTestId('ip-connect').click();

    // Лобби у обоих, с настоящими именами.
    for (const win of [hw, gw]) {
      await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
      await expect(win.getByTestId('player-p1')).toContainText('Аня');
      await expect(win.getByTestId('player-p2')).toContainText('Женя');
    }
    await expect(hw.getByTestId('game-maze')).toBeEnabled();
    await expect(gw.getByTestId('game-maze')).toBeDisabled();

    await hw.getByTestId('ready').click();
    await expect(gw.getByTestId('ready-p1')).toHaveText('Готов');
    await shot(hw, 'phase2-lobby');

    await gw.getByTestId('ready').click();
    // Отсчёт 3‑2‑1 у обоих.
    for (const win of [hw, gw]) {
      await expect(win.getByTestId('screen-countdown')).toBeVisible({ timeout: 10_000 });
      await expect(win.getByTestId('countdown-value')).toHaveText(/^[123]$/);
    }

    let round = 1;
    let matchOver = false;
    while (!matchOver) {
      await waitGame(hw);
      await waitGame(gw);
      if (round === 1) {
        // Гость пробует настоящую клавиатуру (стрелка), хост ведёт точку хуком.
        await gw.keyboard.down('ArrowUp');
        await gw.waitForTimeout(300);
        await gw.keyboard.up('ArrowUp');
        await hw.waitForTimeout(1200);
        await shot(hw, 'phase2-game-fog', 0);
      }

      // Раунд кончается встречей — результат с % пути у обоих.
      for (const win of [hw, gw]) {
        await expect(screen(win, 'result')).toBeVisible({ timeout: 60_000 });
        await expect(win.getByTestId('result-pct-p1')).toHaveText(/^\d+% пути$/);
        await expect(win.getByTestId('result-pct-p2')).toHaveText(/^\d+% пути$/);
      }
      const headline = (await hw.getByTestId('result-headline').textContent()) ?? '';
      matchOver = headline.includes('Матч') || headline.includes('матч');
      if (round === 1) {
        await hw.waitForTimeout(800); // анимация полос
        await shot(hw, 'phase2-result', 0);
      }
      if (matchOver) break;

      // «Ещё раз» = сразу готов: у хоста в лобби он уже готов, соперник — ещё нет.
      await hw.getByTestId('again').click();
      await expect(screen(hw, 'lobby')).toBeVisible();
      await expect(hw.getByTestId('ready-p1')).toHaveText('Готов');
      await gw.getByTestId('again').click();
      round++;
      expect(round).toBeLessThanOrEqual(5);
    }

    // Экран победителя матча.
    await expect(hw.getByTestId('result-headline')).toHaveText(/Матч выигран!|Победа в матче/);
    await expect(gw.getByTestId('result-headline')).toHaveText(/Матч выигран!|Победа в матче/);
    await expect(hw.getByTestId('result-match')).toContainText('3');
    await shot(hw, 'phase2-match', 800);

    // Новый матч, и гость пропадает посреди раунда → у хоста лобби с сообщением.
    // Первое «Новый матч» обнуляет счёт в лобби, и HUD первого раунда начинает с 0:0.
    await setAutoplay(hw, false);
    await hw.getByTestId('again').click();
    await expect(screen(hw, 'lobby')).toBeVisible();
    await expect(hw.getByTestId('lobby-match')).toHaveAttribute('aria-label', 'Счёт матча 0:0');
    await gw.getByTestId('again').click();
    await waitGame(hw);
    await waitGame(gw);
    for (const win of [hw, gw]) {
      await expect(win.getByTestId('game-canvas')).toHaveAttribute('data-match', '0:0');
    }
    await guest.app.close();
    await expect(screen(hw, 'lobby')).toBeVisible({ timeout: 10_000 });
    await expect(hw.getByTestId('lobby-notice')).toContainText('Соперник отключился');
    await expect(hw.getByTestId('player-p2')).toContainText('Ждём соперника');
  } finally {
    await Promise.allSettled([host.app.close(), guest.app.close()]);
  }
});

test('приложение против tools/bot.ts доигрывает раунд до встречи', async () => {
  const port = randomPort();
  const { app, win } = await launch({ env: { TWODOTS_PORT: String(port), TWODOTS_E2E: '1' } });
  const bots: ChildProcess[] = [];
  let botLog = '';
  const spawnBot = () =>
    new Promise<number | null>((resolve) => {
      const bot = spawn(
        'pnpm',
        ['bot', '--host', '127.0.0.1', '--port', String(port), '--rounds', '1', '--quiet'],
        { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
      );
      bots.push(bot);
      bot.stdout?.on('data', (d: Buffer) => (botLog += d.toString()));
      bot.stderr?.on('data', (d: Buffer) => (botLog += d.toString()));
      bot.on('exit', (code) => resolve(code));
    });
  try {
    await createGame(win, 'Аня');
    const exited = spawnBot();

    await expect(screen(win, 'lobby')).toBeVisible({ timeout: 20_000 });
    await expect(win.getByTestId('player-p2')).toContainText('Бот');
    await expect(win.getByTestId('ready-p2')).toHaveText('Готов');
    await win.getByTestId('ready').click();
    await waitGame(win);

    // Хост стоит на месте — бот идёт к нему по BFS и встречает.
    await expect(screen(win, 'result')).toBeVisible({ timeout: 60_000 });
    await expect(win.getByTestId('result-headline')).toHaveText('Поражение');
    await expect(win.getByTestId('result-pct-p2')).toHaveText(/^\d+% пути$/);
    expect(await exited, botLog).toBe(0);
    expect(botLog).toContain('раунд 1 окончен');

    // Бот ушёл, пока хост смотрит результат, — сообщение прямо на экране результата.
    await expect(win.getByTestId('result-notice')).toContainText('Соперник отключился');
    await win.getByTestId('again').click();
    await expect(screen(win, 'lobby')).toBeVisible();
    await expect(win.getByTestId('lobby-notice')).toContainText('Соперник отключился');
    // «Ещё раз» = готов; снимаем готовность, чтобы новый бот не запустил раунд сразу.
    await expect(win.getByTestId('ready-p1')).toHaveText('Готов');
    await win.getByTestId('ready').click();
    await expect(win.getByTestId('ready-p1')).toHaveText('Не готов');

    // Соперник вернулся — старое сообщение пропадает.
    void spawnBot();
    await expect(win.getByTestId('player-p2')).toContainText('Бот', { timeout: 20_000 });
    await expect(win.getByTestId('lobby-notice')).toBeHidden();
  } finally {
    for (const bot of bots) bot.kill();
    await app.close();
  }
});
