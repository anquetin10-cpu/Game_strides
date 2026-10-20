// Génère les icônes PNG (apple-touch-icon, PWA) à partir de public/icon.svg.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [size, name] of [[180, 'apple-touch-icon.png'], [512, 'icon-512.png'], [192, 'icon-192.png']]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:#121316">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: false });
  await page.close();
}
await browser.close();
console.log('icons ok');
