import { RA } from '@iwasa-kosui/result';

import type { DigestHeaderResolverByArticleId } from '../../../domain/digest/digest.ts';
import { singleton } from '../../../helper/singleton.ts';

const getInstance = singleton((): DigestHeaderResolverByArticleId => ({
  resolve: async () => RA.ok(undefined),
}));

export const PgDigestHeaderResolverByArticleId = {
  getInstance,
} as const;
