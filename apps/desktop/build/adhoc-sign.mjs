// afterPack-хук electron-builder: ad-hoc подпись .app на macOS (без сертификата разработчика).
// Без неё у бандла остаётся «битая» печать после правки Info.plist, и macOS называет
// скачанное приложение «повреждённым». С ad-hoc подписью работает «правый клик → Открыть»
// (или `xattr -cr /Applications/2Dots.app`).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export default async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
}
