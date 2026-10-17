import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const main = join(import.meta.dirname, '../out/main/index.js');
const screenshot = join(import.meta.dirname, 'screenshots/maze-local.png');

// tsconfig.node без DOM-типов — минимальное описание canvas для evaluate.
interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): {
    getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
  } | null;
}

/** Удерживает клавиши по очереди, пока атрибут data-<player> не изменится. */
async function moveWithAny(win: Page, player: 'p1' | 'p2', keys: string[]): Promise<void> {
  const root = win.getByTestId('local-mode');
  const before = await root.getAttribute(`data-${player}`);
  for (const key of keys) {
    await win.keyboard.down(key);
    await win.waitForTimeout(400);
    await win.keyboard.up(key);
    if ((await root.getAttribute(`data-${player}`)) !== before) return;
  }
  throw new Error(`${player} не сдвинулся (${keys.join(', ')}), позиция ${before}`);
}

test('локальный режим: лабиринт отрисован, клавиши двигают точки', async () => {
  const app = await electron.launch({
    args: [main],
    env: { ...process.env, TWODOTS_MODE: 'local' },
  });
  const win = await app.firstWindow();
  await expect(win).toHaveTitle('2Dots');

  const canvas = win.getByTestId('maze-canvas');
  await expect(canvas).toBeVisible();
  const root = win.getByTestId('local-mode');
  await expect(root).toHaveAttribute('data-p1', '0,0');

  // Канвас отрисован: размер под окно и на нём не один цвет.
  await expect
    .poll(() =>
      canvas.evaluate((node) => {
        const el = node as unknown as CanvasLike;
        if (el.width < 100 || el.height < 100) return 0;
        const ctx = el.getContext('2d');
        if (!ctx) return 0;
        const data = ctx.getImageData(0, 0, el.width, el.height).data;
        const colors = new Set<number>();
        for (let i = 0; i < data.length; i += 4 * 97) {
          colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
        }
        return colors.size;
      }),
    )
    .toBeGreaterThan(5);

  await win.screenshot({ path: screenshot });

  // p1 стартует в (0,0) — вправо или вниз; p2 в противоположном углу — влево или вверх.
  await moveWithAny(win, 'p1', ['KeyD', 'KeyS']);
  await moveWithAny(win, 'p2', ['ArrowLeft', 'ArrowUp']);
  await expect(root).not.toHaveAttribute('data-p1', '0,0');

  // Туман войны (F): снимок для визуальной проверки.
  await win.keyboard.press('KeyF');
  await win.waitForTimeout(200);
  await win.screenshot({ path: join(import.meta.dirname, 'screenshots/maze-local-fog.png') });

  await app.close();
});
