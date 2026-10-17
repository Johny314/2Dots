import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

const main = join(import.meta.dirname, '../out/main/index.js');

test('приложение запускается и показывает заставку', async () => {
  const app = await electron.launch({ args: [main] });
  const win = await app.firstWindow();
  await expect(win).toHaveTitle('2Dots');
  await expect(win.getByTestId('mode')).toContainText('режим: app');
  await app.close();
});

test('можно запустить два экземпляра одновременно', async () => {
  const [a, b] = await Promise.all([
    electron.launch({ args: [main] }),
    electron.launch({ args: [main] }),
  ]);
  await expect(await a.firstWindow()).toHaveTitle('2Dots');
  await expect(await b.firstWindow()).toHaveTitle('2Dots');
  await Promise.all([a.close(), b.close()]);
});
