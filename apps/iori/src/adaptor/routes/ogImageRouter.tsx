import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import satori from 'satori';
import sharp from 'sharp';
import z from 'zod/v4';

import { ArticleId } from '../../domain/article/articleId.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';

const app = new Hono();

const WIDTH = 1200;
const HEIGHT = 630;

// Cache font data to avoid repeated downloads
let fontDataCache: ArrayBuffer | null = null;

const loadFont = async (): Promise<ArrayBuffer> => {
  if (fontDataCache) {
    return fontDataCache;
  }

  // Fetch Noto Sans JP from Google Fonts API
  // First, get the CSS to extract the actual font URL
  // Use an old browser User-Agent to get TTF format (satori doesn't support woff2)
  const cssResponse = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700',
    {
      headers: {
        // Use Safari 5 User-Agent to get TTF format instead of woff2
        'User-Agent': 'Safari/534.30',
      },
    },
  );
  const css = await cssResponse.text();

  // Extract font URL from CSS (format: url(https://...))
  // Look for .ttf or .otf URLs
  const fontUrlMatch = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:ttf|otf)[^)]*)\)/)
    || css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!fontUrlMatch) {
    throw new Error('Failed to extract font URL from Google Fonts CSS');
  }

  const fontUrl = fontUrlMatch[1];
  const fontResponse = await fetch(fontUrl);
  fontDataCache = await fontResponse.arrayBuffer();
  return fontDataCache;
};

const generateOgImage = async (title: string): Promise<Buffer> => {
  const fontData = await loadFont();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #F8F6F1 0%, #F0EEE9 100%)',
        position: 'relative',
      },
      children: [
        // Decorative blobs
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: -50,
              right: -50,
              width: 400,
              height: 360,
              borderRadius: '50%',
              background: '#D49A82',
              opacity: 0.15,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: -30,
              left: -50,
              width: 300,
              height: 280,
              borderRadius: '50%',
              background: '#D4C4A8',
              opacity: 0.2,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: 100,
              right: 100,
              width: 200,
              height: 180,
              borderRadius: '50%',
              background: '#8FA88B',
              opacity: 0.12,
            },
          },
        },
        // Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 80px',
              textAlign: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#5A5450',
                  lineHeight: 1.3,
                  maxWidth: 1000,
                  wordBreak: 'break-word',
                },
                children: title,
              },
            },
          },
        },
        // Site name
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: 50,
              fontSize: 24,
              color: '#7A746E',
            },
            children: 'blog.kosui.me',
          },
        },
      ],
    },
  };

  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: 'Noto Sans JP',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const png = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return png;
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
    const png = await generateOgImage(article.title);

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
