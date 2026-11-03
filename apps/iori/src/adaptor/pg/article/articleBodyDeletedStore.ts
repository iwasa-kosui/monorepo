import { RA } from '@iwasa-kosui/result';

import type { ArticleBodyDeletedStore } from '../../../domain/articleBody/articleBody.ts';
import { singleton } from '../../../helper/singleton.ts';

const getInstance = singleton((): ArticleBodyDeletedStore => ({
  store: async () => RA.ok(undefined),
}));

export const PgArticleBodyDeletedStore = {
  getInstance,
} as const;
