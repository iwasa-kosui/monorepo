import { RA } from '@iwasa-kosui/result';

import type { DigestResolverByArticleId } from '../../../domain/digest/digest.ts';
import { singleton } from '../../../helper/singleton.ts';

const getInstance = singleton((): DigestResolverByArticleId => ({
  resolve: async () => RA.ok(undefined),
}));

export const PgDigestResolverByArticleId = {
  getInstance,
} as const;
