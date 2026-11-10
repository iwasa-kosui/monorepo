import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { renderWorkerOgImage } from './workerOgImageRenderer.ts';

const fontPath = fileURLToPath(new URL('../../../../nen-diagnosis/scripts/fonts/NotoSansJP-Bold.ttf', import.meta.url));

describe('renderWorkerOgImage', () => {
  it('renders a Japanese title as a PNG', async () => {
    const font = await readFile(fontPath);
    const fontData = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer;

    const png = await renderWorkerOgImage({ title: 'Cloudflare Workers で OGP 画像を生成する', fontData });

    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }, 30_000);
});
