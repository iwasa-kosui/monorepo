import { RA } from '@iwasa-kosui/result';

import type { ArticleBodyResolver } from '../../../domain/articleBody/articleBody.ts';
import { singleton } from '../../../helper/singleton.ts';

const getInstance = singleton((): ArticleBodyResolver => ({
  resolve: async () => RA.ok(undefined),
}));

export const PgArticleBodyResolver = {
  getInstance,
} as const;
