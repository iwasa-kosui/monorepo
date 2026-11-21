import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const chapter2Goal = (): string => {
  const source = readFileSync(new URL('../src/content/chapters/chapter-2/01.mdx', import.meta.url), 'utf8');
  const goal = /^goal:\s*(.+)$/m.exec(source)?.[1];
  if (goal === undefined) {
    throw new Error('chapter-2/01.mdx に goal がありません');
  }
  return goal.trim();
};

test('PC の最初の画面で「導入から始める」が見え、押すと導入に進める', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto('/');
  const start = page.getByRole('link', { name: '導入から始める' });
  await expect(start).toBeInViewport();
  await start.click();
  await expect(page).toHaveURL(/\/chapters\/intro\/$/);
});

test('スマートフォンの最初の画面で「導入から始める」が見える', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: '導入から始める' })).toBeInViewport();
});

for (const path of ['/', '/chapters/chapter-2/']) {
  test(`${path} の head に説明、OGP、アイコンがある`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  });
}

test('章のページの description は、その章の goal と一致する', async ({ page }) => {
  await page.goto('/chapters/chapter-2/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', chapter2Goal());
});
