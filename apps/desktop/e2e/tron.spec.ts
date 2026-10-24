// «Трон» на мок-клиенте: выбор игры в лобби, настройки, раунд с аварией и экран результата.
import { expect, test } from '@playwright/test';
import { launch, screen, shot } from './helpers';

test.describe.configure({ timeout: 60_000 });

test('мок: хост выбирает «Трон» → раунд → авария → результат', async () => {
  const { app, win } = await launch({ mode: 'mock' });
  try {
    await expect(screen(win, 'home')).toBeVisible();
    await win.getByTestId('name-input').fill('Аня');
    await win.getByTestId('create-game').click();
    await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });

    await win.getByTestId('game-tron').click();
    await expect(win.getByTestId('game-tron')).toHaveAttribute('aria-checked', 'true');
    await expect(win.getByTestId('setting-accelerate')).toHaveAttribute('aria-checked', 'true');
    await expect(win.getByTestId('setting-wrap')).toHaveAttribute('aria-checked', 'false');
    await shot(win, 'tron-lobby');

    await win.getByTestId('ready').click();
    await expect(win.getByTestId('ready-p1')).toHaveText('Готов');
    await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
    await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
    await expect(win.getByTestId('game-canvas')).toBeVisible();

    // Вверх и снова вправо — след с изгибом.
    await win.waitForTimeout(400);
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(400);
    await win.keyboard.press('ArrowRight');
    await win.waitForTimeout(350);
    await shot(win, 'tron-game', 0);

    // Вверх — в верхний край: мок-раунд длится 4 с, авария случится раньше (~1.3 с).
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(1500);
    await shot(win, 'tron-crash', 0);

    await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByTestId('result-headline')).toHaveText(/Победа!|Поражение|Ничья/);
    await expect(win.getByTestId('result-pct-p1')).toHaveText(/^След: \d+ клет(ка|ки|ок)$/);
    await win.waitForTimeout(800);
    await shot(win, 'tron-result');
  } finally {
    await app.close();
  }
});
