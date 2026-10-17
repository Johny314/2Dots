// Смоук-проверка УПАКОВАННОГО приложения (после pnpm dist:mac / dist:win):
//   pnpm --filter @2dots/desktop smoke:packaged [путь к исполняемому файлу]
// Запускает приложение из release/, ждёт окно, делает скриншот, вызывает window.api.hostStart(),
// подключается к поднятому ws-серверу, вызывает discoverHosts(), hostStop() и проверяет, что порт закрыт.
// Так проверяется, что ws и bonjour-service, забандленные в out/main, работают в asar-пакете.
import { _electron as electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'release');

function defaultExecutable() {
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    return join(release, arch, '2Dots.app', 'Contents', 'MacOS', '2Dots');
  }
  if (process.platform === 'win32') return join(release, 'win-unpacked', '2Dots.exe');
  return join(release, 'linux-unpacked', '2dots');
}

const executablePath = process.argv[2] ? resolve(process.argv[2]) : defaultExecutable();
if (!existsSync(executablePath)) {
  console.error(`smoke: нет ${executablePath} — сначала pnpm dist:mac / dist:win`);
  process.exit(1);
}

function connect(url, timeoutMs = 5000) {
  return new Promise((resolveConnect, rejectConnect) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      rejectConnect(new Error(`таймаут подключения к ${url}`));
    }, timeoutMs);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      ws.close();
      resolveConnect();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      rejectConnect(new Error(`не удалось подключиться к ${url}`));
    });
  });
}

function fail(message) {
  throw new Error(message);
}

console.log(`smoke: запускаю ${executablePath}`);
const app = await electron.launch({
  executablePath,
  // Случайный порт: не мешаем запущенному рядом 2Dots.
  env: { ...process.env, TWODOTS_PORT: '0' },
});
const logs = [];
app.process().stdout?.on('data', (d) => logs.push(String(d)));
app.process().stderr?.on('data', (d) => logs.push(String(d)));

let ok = false;
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const title = await win.title();
  if (title !== '2Dots') fail(`заголовок окна «${title}», ожидался «2Dots»`);
  const version = await win.evaluate(() => window.api.getVersion());
  console.log(`smoke: окно «${title}», версия ${version}`);
  const shot = join(release, 'smoke.png');
  await win.screenshot({ path: shot });
  console.log(`smoke: скриншот ${shot}`);

  const info = await win.evaluate(() => window.api.hostStart('smoke'));
  console.log(`smoke: hostStart → ${JSON.stringify(info)}`);
  if (!Number.isInteger(info.port) || info.port <= 0) fail('hostStart вернул некорректный порт');
  if (info.ips.some((ip) => ip.startsWith('127.') || ip.startsWith('169.254.'))) {
    fail('hostStart вернул loopback/link-local адрес');
  }
  const again = await win.evaluate(() => window.api.hostStart('smoke'));
  if (again.port !== info.port) fail('повторный hostStart поднял другой сервер');

  await connect(`ws://127.0.0.1:${info.port}`);
  console.log(`smoke: ws://127.0.0.1:${info.port} — подключение есть`);
  if (info.ips[0]) {
    await connect(`ws://${info.ips[0]}:${info.port}`);
    console.log(`smoke: ws://${info.ips[0]}:${info.port} — подключение есть`);
  }

  const hosts = await win.evaluate(() => window.api.discoverHosts());
  console.log(`smoke: discoverHosts → ${JSON.stringify(hosts)}`);

  await win.evaluate(() => window.api.hostStop());
  const closed = await connect(`ws://127.0.0.1:${info.port}`, 2000).then(
    () => false,
    () => true,
  );
  if (!closed) fail('после hostStop порт всё ещё принимает подключения');
  console.log('smoke: hostStop — порт закрыт');

  // Выход при работающем хосте: before-quit должен остановить сервер и завершить процесс.
  const relaunched = await win.evaluate(() => window.api.hostStart('smoke'));
  await app.close();
  const freed = await connect(`ws://127.0.0.1:${relaunched.port}`, 2000).then(
    () => false,
    () => true,
  );
  if (!freed) fail('после выхода из приложения порт всё ещё открыт');
  console.log('smoke: выход из приложения — сервер остановлен');
  ok = true;
} catch (err) {
  console.error(`smoke: ОШИБКА — ${err instanceof Error ? err.message : String(err)}`);
  if (logs.length) console.error(`--- вывод приложения ---\n${logs.join('')}`);
} finally {
  if (!ok) await app.close().catch(() => undefined);
}
console.log(ok ? 'smoke: OK' : 'smoke: FAILED');
process.exit(ok ? 0 : 1);
