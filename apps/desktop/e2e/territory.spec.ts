// «Территория» на мок-клиенте: выбор игры в лобби, настройка, раунд, экран результата.
import { expect, test } from '@playwright/test';
import { launch, screen, shot } from './helpers';

test.describe.configure({ timeout: 60_000 });

test('мок: хост выбирает «Территорию», меняет настройку, играет раунд', async () => {
  const { app, win } = await launch({ mode: 'mock' });
  try {
    await win.getByTestId('name-input').fill('Влада');
    await win.getByTestId('create-game').click();
    await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
    // Лобби перерисовывается при подключении соперника — ждём его до выбора игры.
    await expect(win.getByTestId('player-p2')).toContainText('Соперник');

    const pick = win.getByTestId('game-territory');
    await expect(pick).toContainText('Территория');
    await pick.click();
    await expect(pick).toHaveAttribute('aria-checked', 'true');

    // Настройки «Территории»: туман и длинный раунд.
    await expect(win.getByTestId('settings')).toBeVisible();
    const fog = win.getByTestId('setting-fog');
    const long = win.getByTestId('setting-long');
    // Выбор игры сбрасывает настройки к значениям по умолчанию, но не полагаемся на это.
    const flip = async (toggle: typeof fog) => {
      const was = await toggle.getAttribute('aria-checked');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
    };
    // Туман включается и выключается; длинный раунд — включён (видно по таймеру 2:2x).
    await flip(fog);
    await flip(fog);
    if ((await long.getAttribute('aria-checked')) === 'true') await flip(long);
    await flip(long);
    await expect(long).toHaveAttribute('aria-checked', 'true');
    await expect(fog).toHaveAttribute('aria-checked', 'false');
    await shot(win, 'territory-lobby');

    await win.getByTestId('ready').click();
    await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
    await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
    await expect(win.getByTestId('game-canvas')).toBeVisible();

    // Красим: вправо, затем вниз (как получится в лабиринте).
    await win.keyboard.down('ArrowRight');
    await win.waitForTimeout(700);
    await win.keyboard.up('ArrowRight');
    await win.keyboard.down('KeyS');
    await win.waitForTimeout(700);
    await win.keyboard.up('KeyS');
    await shot(win, 'territory-game', 100);

    // Мок завершает раунд через ~4 с фиктивным результатом (только победитель).
    await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByTestId('result-headline')).toHaveText(/Победа!|Поражение/);
    await win.waitForTimeout(500);
    await shot(win, 'territory-result');
  } finally {
    await app.close();
  }
});
