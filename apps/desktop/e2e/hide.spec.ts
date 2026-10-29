// «Прятки» на мок-клиенте: роли в лобби, подпись роли на отсчёте, раунд за обе роли.
import { expect, test } from '@playwright/test';
import { launch, screen, shot } from './helpers';

test.describe.configure({ timeout: 90_000 });

test('мок: «Прятки» — хост выбирает роль, прячется, потом ищет с подсказкой', async () => {
  const { app, win } = await launch({ mode: 'mock' });
  try {
    await win.getByTestId('name-input').fill('Влада');
    await win.getByTestId('create-game').click();
    await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
    await expect(win.getByTestId('player-p2')).toContainText('Соперник');

    await win.getByTestId('game-hide').click();
    await expect(win.getByTestId('game-hide')).toHaveAttribute('aria-checked', 'true');

    // Роли: по умолчанию случайные; выключаем — появляется «Хост прячется».
    const random = win.getByTestId('setting-random-roles');
    await expect(random).toHaveAttribute('aria-checked', 'true');
    await expect(win.getByTestId('setting-host-hides')).toBeHidden();
    await random.click();
    await expect(random).toHaveAttribute('aria-checked', 'false');
    const hostHides = win.getByTestId('setting-host-hides');
    await expect(hostHides).toHaveAttribute('aria-checked', 'true');
    await shot(win, 'hide-lobby');

    // Раунд 1: хост прячется.
    await win.getByTestId('ready').click();
    await expect(win.getByTestId('countdown-caption')).toHaveText('Прятки · вы прячетесь');
    await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
    await win.keyboard.down('ArrowRight');
    await win.waitForTimeout(500);
    await win.keyboard.up('ArrowRight');
    await shot(win, 'hide-game-hider', 100);
    await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByTestId('result-pct-p1')).toContainText('Прятался');
    await expect(win.getByTestId('result-pct-p2')).toContainText('Искал');

    // Раунд 2: хост ищет.
    await win.getByTestId('result-lobby').click();
    await expect(screen(win, 'lobby')).toBeVisible();
    await win.getByTestId('setting-host-hides').click();
    await expect(win.getByTestId('setting-host-hides')).toHaveAttribute('aria-checked', 'false');
    await win.getByTestId('ready').click();
    await expect(win.getByTestId('countdown-caption')).toHaveText('Прятки · вы ищете');
    await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
    await shot(win, 'hide-game-headstart', 300);
    // Фора — треть мок-раунда; после неё — подсказка.
    await win.waitForTimeout(1600);
    await win.keyboard.press('KeyH');
    await shot(win, 'hide-game-seeker-hint', 150);
    await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByTestId('result-pct-p1')).toContainText('Искал');
    await expect(win.getByTestId('result-pct-p1')).toContainText('подсказок: 1');
    await shot(win, 'hide-result', 500);
  } finally {
    await app.close();
  }
});
