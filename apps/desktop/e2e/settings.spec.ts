// Настройки лабиринта (туман, «Горячо-холодно») по настоящей сети и анимация встречи.
import { expect, test, type Page } from '@playwright/test';
import { launch, randomPort, screen, shot } from './helpers';

interface Hooks {
  autoplay: boolean;
  lastState: {
    config: { fogRadius: number | null; hotCold: boolean };
    result: unknown;
  } | null;
}

const hooks = (win: Page) =>
  win.evaluate(() => {
    const h = (globalThis as unknown as { __twodots: Hooks }).__twodots;
    return { autoplay: h.autoplay, lastState: h.lastState };
  });

async function setAutoplay(win: Page, on: boolean): Promise<void> {
  await win.evaluate((value) => {
    (globalThis as unknown as { __twodots: Hooks }).__twodots.autoplay = value;
  }, on);
}

const checked = (win: Page, key: string) => win.getByTestId(`setting-${key}`);

test.describe.configure({ timeout: 180_000 });

test('хост выключает туман и включает «Горячо-холодно»: гость видит, раунд идёт по новым правилам, встреча анимируется', async () => {
  const port = randomPort();
  const host = await launch({ env: { TWODOTS_PORT: String(port), TWODOTS_E2E: '1' } });
  const guest = await launch({ env: { TWODOTS_E2E: '1' } });
  const hw = host.win;
  const gw = guest.win;
  try {
    await hw.getByTestId('name-input').fill('Аня');
    await hw.getByTestId('create-game').click();
    await expect(hw.getByTestId('host-status')).toContainText('Ждём подключения', {
      timeout: 10_000,
    });

    // Настройки видны уже на экране ожидания. Приводим к значениям по умолчанию
    // (localStorage общий между прогонами), затем выключаем туман.
    await expect(hw.getByTestId('settings')).toBeVisible();
    if ((await checked(hw, 'fog').getAttribute('aria-checked')) === 'false') {
      await checked(hw, 'fog').click();
    }
    if ((await checked(hw, 'hotcold').getAttribute('aria-checked')) === 'true') {
      await checked(hw, 'hotcold').click();
    }
    await expect(checked(hw, 'fog')).toHaveAttribute('aria-checked', 'true');
    await checked(hw, 'fog').click();
    await expect(checked(hw, 'fog')).toHaveAttribute('aria-checked', 'false');

    // Гость присоединяется и видит настройки хоста, но не может их менять.
    await gw.getByTestId('name-input').fill('Женя');
    await gw.getByTestId('join-game').click();
    await gw.getByTestId('ip-input').fill(`127.0.0.1:${port}`);
    await gw.getByTestId('ip-connect').click();
    for (const win of [hw, gw]) await expect(screen(win, 'lobby')).toBeVisible({ timeout: 10_000 });
    await expect(checked(gw, 'fog')).toHaveAttribute('aria-checked', 'false');
    await expect(checked(gw, 'fog')).toBeDisabled();
    await expect(checked(gw, 'hotcold')).toBeDisabled();

    // Гость уже готов — смена настроек хостом сбрасывает готовность.
    await gw.getByTestId('ready').click();
    await expect(hw.getByTestId('ready-p2')).toHaveText('Готов');
    await checked(hw, 'hotcold').click();
    await expect(checked(gw, 'hotcold')).toHaveAttribute('aria-checked', 'true');
    await expect(hw.getByTestId('ready-p2')).toHaveText('Не готов');
    await shot(hw, 'settings-lobby-host');
    await shot(gw, 'settings-lobby-guest');

    await hw.getByTestId('ready').click();
    await gw.getByTestId('ready').click();
    for (const win of [hw, gw]) {
      await expect(screen(win, 'game')).toBeVisible({ timeout: 10_000 });
      await expect(win.getByTestId('screen-countdown')).toBeHidden({ timeout: 10_000 });
    }

    // Раунд идёт с настройками хоста.
    const st = (await hooks(gw)).lastState;
    expect(st?.config).toMatchObject({ fogRadius: null, hotCold: true });

    // Хост идёт навстречу — у гостя индикатор теплеет.
    await setAutoplay(hw, true);
    await gw.waitForTimeout(1500);
    await shot(gw, 'settings-hotcold-guest', 0);

    await setAutoplay(gw, true);
    // Как только пришёл state с результатом — у обоих ещё экран игры (идёт анимация встречи).
    await expect
      .poll(async () => (await hooks(hw)).lastState?.result != null, { timeout: 60_000 })
      .toBe(true);
    await expect(screen(hw, 'game')).toBeVisible();
    await hw.waitForTimeout(500);
    await shot(hw, 'settings-meet-outro', 0);

    // Затем — результат с числом исследованных клеток.
    for (const win of [hw, gw]) {
      await expect(screen(win, 'result')).toBeVisible({ timeout: 5_000 });
      await expect(win.getByTestId('result-pct-p1')).toHaveText(
        /^\d+ клет(ка|ки|ок) · \d+% лабиринта$/,
      );
    }
  } finally {
    // Вернуть настройки по умолчанию в общий localStorage для других прогонов.
    await hw.evaluate(() => localStorage.removeItem('twodots.settings')).catch(() => undefined);
    await Promise.all([host.app.close(), guest.app.close()]);
  }
});
