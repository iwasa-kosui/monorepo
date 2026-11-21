import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');

const tokenValue = (name: string): string => {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (match?.[1] === undefined) {
    throw new Error(`tokens.css に ${name} がありません`);
  }
  return match[1].trim();
};

const navy900 = tokenValue('--navy-900');
const blue300 = tokenValue('--blue-300');
const blue200 = tokenValue('--blue-200');
const gray0 = tokenValue('--gray-0');
const yellow400 = tokenValue('--yellow-400');
const fontBody = tokenValue('--font-body').replace(/\s+/g, ' ');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px;
    height: 630px;
    overflow: hidden;
    background: ${navy900};
    font-family: ${fontBody};
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 64px 80px 0;
  }
  .mark { display: block; width: 120px; height: 107px; }
  .event {
    margin-top: 28px;
    color: ${blue200};
    font-size: 28px;
    letter-spacing: 0.02em;
  }
  h1 {
    margin-top: 16px;
    color: ${gray0};
    font-size: 84px;
    font-weight: 800;
    line-height: 1.2;
  }
  .subtitle {
    margin-top: 24px;
    color: ${blue300};
    font-size: 40px;
    font-weight: 500;
  }
  .band {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 12px;
    background: ${blue300};
  }
</style>
</head>
<body>
  <div class="frame">
    <svg class="mark" viewBox="7 8 18 16" aria-hidden="true">
      <rect x="7" y="8" width="18" height="4" rx="1.5" fill="${gray0}" />
      <rect x="7" y="14" width="13" height="4" rx="1.5" fill="${gray0}" />
      <rect x="7" y="20" width="9" height="4" rx="1.5" fill="${yellow400}" />
    </svg>
    <p class="event">YAPC::Tokyo 2026 ライブコーディング・ハンズオン</p>
    <h1>もう他人ごとじゃない<br />イベントソーシング</h1>
    <p class="subtitle">社会を支える既存システムへの部分適用</p>
    <div class="band"></div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: join(root, 'public/og.png'), type: 'png' });
} finally {
  await browser.close();
}
