import { Result } from '@iwasa-kosui/result';

import {
  BlueskyCrosspost,
  type BlueskyCrosspostResolver,
  type BlueskyQuoteContext,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { LocalPost, LocalPostResolverByUri, PostQuotesResolverByPostIds } from '../../domain/post/post.ts';

type Deps = Readonly<{
  localPostResolverByUri: LocalPostResolverByUri;
  crosspostResolver: BlueskyCrosspostResolver;
  postQuotesResolver: PostQuotesResolverByPostIds;
}>;

export const resolveBlueskyQuoteContextWith =
  ({ localPostResolverByUri, crosspostResolver, postQuotesResolver }: Deps) =>
  async (post: LocalPost): Promise<BlueskyQuoteContext> => {
    const quote = Result.unsafeUnwrap(await postQuotesResolver.resolve([post.postId])).get(post.postId);
    if (quote === undefined) return { kind: 'none' };
    const quoted = Result.unsafeUnwrap(await localPostResolverByUri.resolve({ uri: quote.uri }));
    if (quoted === undefined || quoted.userId !== post.userId) return { kind: 'unsent' };
    const crosspost = Result.unsafeUnwrap(await crosspostResolver.resolve(quoted.postId));
    if (crosspost !== undefined && BlueskyCrosspost.canRetry(crosspost)) return { kind: 'waiting' };
    if (crosspost?.status !== 'sent' || crosspost.uri === null || crosspost.cid === null) return { kind: 'unsent' };
    return { kind: 'sent', uri: crosspost.uri, cid: crosspost.cid, quoteUri: quote.uri };
  };
