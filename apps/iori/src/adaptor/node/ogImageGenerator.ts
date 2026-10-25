import { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';
import { loadNodeOgFont } from './ogImageFont.ts';
import { renderNodeOgImage } from './ogImageRenderer.ts';

let fontDataCache: ArrayBuffer | undefined;
export const generateNodeOgImage = async (title: string): Promise<Buffer> => {
  fontDataCache ??= await loadNodeOgFont();
  return renderNodeOgImage({ title, fontData: fontDataCache });
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
