// Баннер обновления (мок window.api: TWODOTS_MOCK_UPDATE).
import { expect, test } from '@playwright/test';
import { launch, screen, shot } from './helpers';

test('скачанное обновление: «Перезапустить», баннер можно скрыть', async () => {
  const { app, win } = await launch({ mode: 'mock', env: { TWODOTS_MOCK_UPDATE: 'ready' } });
  try {
    await expect(screen(win, 'home')).toBeVisible();
    const banner = win.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Версия 9.9.9 готова');
    await expect(win.getByTestId('update-install')).toBeVisible();
    await shot(win, 'update-banner-ready');
    await win.getByTestId('update-dismiss').click();
    await expect(banner).toBeHidden();
  } finally {
    await app.close();
  }
});

test('новая версия для ручной установки: «Скачать»; во время игры баннер скрыт', async () => {
  const { app, win } = await launch({ mode: 'mock', env: { TWODOTS_MOCK_UPDATE: 'available' } });
  try {
    const banner = win.getByTestId('update-banner');
    await expect(banner).toContainText('Вышла версия 9.9.9');
    await expect(win.getByTestId('update-download')).toBeVisible();

    // Создать игру → соперник-мок подключается → оба готовы → игра.
    await win.getByTestId('name-input').fill('Влада');
    await win.getByTestId('create-game').click();
    await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
    await expect(banner).toBeVisible();
    await win.getByTestId('ready').click();
    await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
    await expect(banner).toBeHidden();
  } finally {
    await app.close();
  }
});
