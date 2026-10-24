// «Ключ и дверь» на мок-клиенте: выбор кооперативной игры в лобби, игра, общий итог.
import { expect, test, type Page } from '@playwright/test';
import { launch, screen, shot } from './helpers';

test.describe.configure({ timeout: 90_000 });

const toggle = (win: Page, key: string) => win.getByTestId(`setting-${key}`);

/** Приводит переключатель к нужному состоянию (настройки хоста запоминаются между запусками). */
async function setToggle(win: Page, key: string, on: boolean): Promise<void> {
  const want = on ? 'true' : 'false';
  if ((await toggle(win, key).getAttribute('aria-checked')) !== want) {
    await toggle(win, key).click();
  }
  await expect(toggle(win, key)).toHaveAttribute('aria-checked', want);
}

async function openKeysLobby(win: Page): Promise<void> {
  await expect(screen(win, 'home')).toBeVisible();
  await win.getByTestId('name-input').fill('Влада');
  await win.getByTestId('create-game').click();
  await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('player-p2')).toContainText('Соперник', { timeout: 10_000 });

  const option = win.getByTestId('game-keys');
  await expect(option).toContainText('Ключ и дверь');
  await expect(option).toContainText('вместе');
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  // Кооператив: счёт матча не показывается.
  await expect(win.getByTestId('lobby-match')).toHaveCount(0);
  await expect(screen(win, 'lobby')).toContainText('Кооператив');
  await expect(toggle(win, 'fog')).toBeVisible();
  await expect(toggle(win, 'doors')).toBeVisible();
}

async function playRound(win: Page, shotName: string): Promise<void> {
  await win.getByTestId('ready').click();
  await expect(win.getByTestId('ready-p1')).toHaveText('Готов');
  await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
  await expect(win.getByTestId('game-canvas')).toBeVisible();
  // Немного походить, чтобы на снимке был след.
  await win.keyboard.down('ArrowRight');
  await win.waitForTimeout(450);
  await win.keyboard.up('ArrowRight');
  await win.keyboard.down('ArrowDown');
  await win.waitForTimeout(450);
  await win.keyboard.up('ArrowDown');
  await shot(win, shotName, 100);
}

test('ключ и дверь (мок): лобби «вместе» → игра → общий итог', async () => {
  const { app, win } = await launch({ mode: 'mock' });
  try {
    await openKeysLobby(win);
    await setToggle(win, 'fog', true);
    await setToggle(win, 'doors', false);
    await shot(win, 'keys-lobby');

    await playRound(win, 'keys-game');

    await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByTestId('result-headline')).toHaveText(/Вы справились!|Не успели/);
    await expect(win.getByTestId('result-team')).toBeVisible();
    await expect(win.getByTestId('result-team')).toHaveText(
      /Выбрались|Не успели выбраться|Открыто дверей \d+\/\d+/,
    );
    await expect(win.getByTestId('result-match')).toHaveCount(0);
    await shot(win, 'keys-result');
  } finally {
    await app.close();
  }
});

test('ключ и дверь (мок): без тумана и с тремя дверями — видно весь лабиринт', async () => {
  const { app, win } = await launch({ mode: 'mock' });
  try {
    await openKeysLobby(win);
    await setToggle(win, 'fog', false);
    await setToggle(win, 'doors', true);
    await playRound(win, 'keys-game-nofog');
    await expect(screen(win, 'result')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByTestId('result-team')).toBeVisible();

    // Вернуть настройки по умолчанию (они запоминаются для следующих запусков).
    await win.getByTestId('again').click();
    await expect(screen(win, 'lobby')).toBeVisible();
    await setToggle(win, 'fog', true);
    await setToggle(win, 'doors', false);
  } finally {
    await app.close();
  }
});
