// Проход всех экранов интерфейса на мок-клиенте (TWODOTS_MODE=mock → ?mock=1).
// Скриншоты ключевых экранов сохраняются в e2e/screenshots/.
import { expect, test } from '@playwright/test';
import { launch as launchApp, screen, shot } from './helpers';

test.describe.configure({ timeout: 60_000 });

const launch = (mode: 'mock' | null) => launchApp({ mode });

test('мок: хост — главное → ожидание → лобби → отсчёт → игра → результат → ещё раз', async () => {
  const { app, win } = await launch('mock');

  await expect(screen(win, 'home')).toBeVisible();
  await expect(win.getByTestId('mode')).toContainText('режим: mock');
  await win.getByTestId('name-input').fill('Влада');
  await shot(win, '01-home');

  // Enter в поле имени = «Создать игру»
  await win.getByTestId('name-input').press('Enter');
  await expect(screen(win, 'host-wait')).toBeVisible();
  await expect(win.getByTestId('host-ips')).toContainText('192.168.1.42');
  await shot(win, '02-host-wait');

  // соперник подключается сам
  await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('player-p1')).toContainText('Влада');
  await expect(win.getByTestId('player-p2')).toContainText('Соперник');
  await expect(win.getByTestId('game-maze')).toBeEnabled();
  await shot(win, '03-lobby');

  // Enter = «Готов» (фокус на кнопке)
  await win.keyboard.press('Enter');
  await expect(win.getByTestId('ready-p1')).toHaveText('Готов');
  await expect(win.getByTestId('screen-countdown')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('countdown-value')).toHaveText(/^[123]$/);
  await shot(win, '04-countdown');

  await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
  await expect(screen(win, 'game')).toBeVisible();
  await expect(win.getByTestId('game-canvas')).toBeVisible();
  await win.waitForTimeout(500);
  await shot(win, '05-game');

  await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
  await expect(win.getByTestId('result-headline')).toHaveText(/Победа!|Поражение|Ничья/);
  await expect(win.getByTestId('result-pct-p1')).toHaveText(
    /^\d+ клет(ка|ки|ок) · \d+% лабиринта$/,
  );
  await expect(win.getByTestId('result-pct-p2')).toHaveText(
    /^\d+ клет(ка|ки|ок) · \d+% лабиринта$/,
  );
  await win.waitForTimeout(800); // анимация полос
  await shot(win, '06-result');

  // «Ещё раз» = сразу готов; остаёмся на экране итога и видим, кто готов, а кого ждём.
  await win.getByTestId('again').click();
  await expect(screen(win, 'result')).toBeVisible();
  await expect(win.getByTestId('rematch-p1')).toContainText('готов');
  await expect(win.getByTestId('again')).toContainText('Отменить');
  await shot(win, '06b-result-rematch', 0);
  // Соперник (мок) тоже готов — раунд начинается прямо с экрана итога.
  await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });

  // Выход из раунда — в лобби, соединение остаётся.
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('leave-confirm')).toBeVisible();
  await win.keyboard.press('Enter');
  await expect(screen(win, 'lobby')).toBeVisible();
  await expect(win.getByTestId('player-p2')).toContainText('Соперник');

  // Хост выходит в меню из лобби — подтверждение: игра закроется и для соперника.
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('menu-confirm')).toBeVisible();
  await win.keyboard.press('Enter');
  await expect(screen(win, 'home')).toBeVisible();
  await app.close();
});

test('мок: гость — присоединение, ошибки подключения, выход из игры, обрыв связи', async () => {
  const { app, win } = await launch('mock');

  // пустое имя не пускает дальше
  await win.getByTestId('name-input').fill('');
  await win.getByTestId('join-game').click();
  await expect(screen(win, 'home')).toBeVisible();
  await expect(win.locator('#name-hint')).toContainText('Введите имя');

  await win.getByTestId('name-input').fill('Женя');
  await win.getByTestId('join-game').click();
  await expect(screen(win, 'join')).toBeVisible();
  await expect(win.getByTestId('host-item')).toHaveCount(3);
  await shot(win, '07-join');

  // некорректный адрес
  await win.getByTestId('ip-input').fill('abc def');
  await win.getByTestId('ip-input').press('Enter');
  await expect(win.getByTestId('join-status')).toContainText('Введите IP-адрес');

  // хост не отвечает — ошибка прямо на экране присоединения
  await win.locator('[data-ip="192.0.2.1"]').click();
  await expect(win.getByTestId('join-status')).toContainText('Не удалось подключиться', {
    timeout: 5_000,
  });
  await shot(win, '08-join-error');

  // успешное подключение по введённому адресу
  await win.getByTestId('ip-input').fill('192.168.1.42');
  await win.getByTestId('ip-input').press('Enter');
  await expect(screen(win, 'lobby')).toBeVisible({ timeout: 5_000 });
  await expect(win.getByTestId('player-p1')).toContainText('MacBook');
  await expect(win.getByTestId('player-p2')).toContainText('Женя');
  await expect(win.getByTestId('game-maze')).toBeDisabled();
  await shot(win, '09-lobby-guest');

  await win.getByTestId('ready').click();
  await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });

  // Esc в игре — подтверждение выхода, повторный Esc — продолжить
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('leave-confirm')).toBeVisible();
  await shot(win, '10-leave-confirm');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('leave-confirm')).toBeHidden();

  // обрыв соединения → экран ошибки
  await win.evaluate(() => {
    (
      globalThis as unknown as { __twodotsMock: { dropConnection(): void } }
    ).__twodotsMock.dropConnection();
  });
  await expect(screen(win, 'error')).toBeVisible();
  await expect(win.getByTestId('error-title')).toHaveText('Соединение потеряно');
  await shot(win, '11-error-disconnect');

  await win.keyboard.press('Enter');
  await expect(screen(win, 'home')).toBeVisible();

  // игра занята → экран ошибки
  await win.getByTestId('join-game').click();
  await win.locator('[data-ip="192.0.2.2"]').click();
  await expect(screen(win, 'error')).toBeVisible({ timeout: 5_000 });
  await expect(win.getByTestId('error-title')).toHaveText('Игра уже занята');
  await app.close();
});

test('мок: соперник отключился во время раунда → лобби с уведомлением', async () => {
  const { app, win } = await launch('mock');
  await win.getByTestId('name-input').fill('Влада');
  await win.getByTestId('create-game').click();
  await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
  await win.getByTestId('ready').click();
  await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });

  await win.evaluate(() => {
    (
      globalThis as unknown as { __twodotsMock: { opponentLeave(): void } }
    ).__twodotsMock.opponentLeave();
  });
  await expect(screen(win, 'lobby')).toBeVisible();
  await expect(win.getByTestId('lobby-notice')).toContainText('Соперник отключился');
  await expect(win.getByTestId('player-p2')).toContainText('Ждём соперника');
  await shot(win, '12-lobby-aborted');
  await app.close();
});
