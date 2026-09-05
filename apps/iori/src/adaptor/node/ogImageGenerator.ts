import satori from 'satori';
import sharp from 'sharp';

import { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';

const WIDTH = 1200;
const HEIGHT = 630;

let fontDataCache: ArrayBuffer | null = null;

const loadFont = async (): Promise<ArrayBuffer> => {
  if (fontDataCache) {
    return fontDataCache;
  }

  const cssResponse = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700',
    {
      headers: {
        'User-Agent': 'Safari/534.30',
      },
    },
  );
  const css = await cssResponse.text();
  const fontUrlMatch = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:ttf|otf)[^)]*)\)/)
    || css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!fontUrlMatch) {
    throw new Error('Failed to extract font URL from Google Fonts CSS');
  }

  const fontResponse = await fetch(fontUrlMatch[1]);
  fontDataCache = await fontResponse.arrayBuffer();
  return fontDataCache;
};

export const generateNodeOgImage = async (title: string): Promise<Buffer> => {
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
        {
          type: 'div',
          props: {
            style: { position: 'absolute', bottom: 50, fontSize: 24, color: '#7A746E' },
            children: 'blog.kosui.me',
          },
        },
      ],
    },
  };
  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Noto Sans JP', data: fontData, weight: 700, style: 'normal' }],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
};

export const createNodeOgImageGenerator = (): OgImageStore => ({
  get: async (articleId) => {
    const articleIdResult = ArticleId.parse(articleId);
    if (!articleIdResult.ok) {
      return undefined;
    }

    const useCase = GetArticleWithThreadUseCase.create({
      articleResolver: PgArticleResolver.getInstance(),
      threadResolver: PgThreadResolver.getInstance(),
    });
    const result = await useCase.run({ articleId: articleIdResult.val });
    if (!result.ok) {
      return undefined;
    }

    const png = await generateNodeOgImage(result.val.article.title);
    const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  },
  put: async () => {
    throw new Error('Node OGP generation does not support object writes');
  },
});
