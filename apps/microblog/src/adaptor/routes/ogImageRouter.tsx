import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import sharp from 'sharp';
import z from 'zod/v4';

import { ArticleId } from '../../domain/article/articleId.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';

const app = new Hono();

const WIDTH = 1200;
const HEIGHT = 630;

const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const wrapText = (text: string, maxCharsPerLine: number): string[] => {
  const lines: string[] = [];
  let currentLine = '';

  for (const char of text) {
    currentLine += char;
    if (currentLine.length >= maxCharsPerLine) {
      lines.push(currentLine);
      currentLine = '';
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
};

const generateOgSvg = (title: string): string => {
  const lines = wrapText(title, 20);
  const lineHeight = 72;
  const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;

  const titleLines = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<text x="${
        WIDTH / 2
      }" y="${y}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="700" fill="#5A5450">${
        escapeXml(line)
      }</text>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F8F6F1"/>
      <stop offset="100%" style="stop-color:#F0EEE9"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- Decorative blobs -->
  <ellipse cx="1100" cy="100" rx="200" ry="180" fill="#D49A82" opacity="0.15"/>
  <ellipse cx="100" cy="530" rx="150" ry="140" fill="#D4C4A8" opacity="0.2"/>
  <ellipse cx="900" cy="500" rx="100" ry="90" fill="#8FA88B" opacity="0.12"/>

  <!-- Title -->
  ${titleLines}

  <!-- Site name -->
  <text x="${WIDTH / 2}" y="${
    HEIGHT - 50
  }" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="#7A746E">blog.kosui.me</text>
</svg>`;
};

app.get(
  '/articles/:articleId',
  sValidator(
    'param',
    z.object({
      articleId: ArticleId.zodType,
    }),
  ),
  async (c) => {
    const { articleId } = c.req.valid('param');

    const useCase = GetArticleWithThreadUseCase.create({
      articleResolver: PgArticleResolver.getInstance(),
      threadResolver: PgThreadResolver.getInstance(),
    });

    const result = await useCase.run({ articleId });

    if (!result.ok) {
      return c.notFound();
    }

    const { article } = result.val;
    const svg = generateOgSvg(article.title);

    const png = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    // Convert Buffer to ArrayBuffer for Response compatibility
    const arrayBuffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;

    return c.newResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  },
);

export const OgImageRouter = app;
