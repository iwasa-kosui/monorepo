import { Result } from '@iwasa-kosui/result';

import {
  BlueskyCrosspost,
  type BlueskyCrosspostResolver,
  type BlueskyReplyContext,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { LocalPost, LocalPostResolverByUri } from '../../domain/post/post.ts';

type Deps = Readonly<{
  localPostResolverByUri: LocalPostResolverByUri;
  crosspostResolver: BlueskyCrosspostResolver;
}>;

export const resolveBlueskyReplyContextWith = ({ localPostResolverByUri, crosspostResolver }: Deps) =>
async (
  post: LocalPost,
): Promise<BlueskyReplyContext> => {
  if (post.inReplyToUri === null) return { kind: 'none' };
  const parent = Result.unsafeUnwrap(await localPostResolverByUri.resolve({ uri: post.inReplyToUri }));
  if (parent === undefined) return { kind: 'unsent' };
  const crosspost = Result.unsafeUnwrap(await crosspostResolver.resolve(parent.postId));
  if (crosspost !== undefined && BlueskyCrosspost.canRetry(crosspost)) return { kind: 'waiting' };
  if (crosspost?.status !== 'sent' || crosspost.uri === null || crosspost.cid === null) return { kind: 'unsent' };
  const parentRef = { uri: crosspost.uri, cid: crosspost.cid };
  const root = crosspost.rootUri !== null && crosspost.rootCid !== null
    ? { uri: crosspost.rootUri, cid: crosspost.rootCid }
    : parentRef;
  return { kind: 'sent', root, parent: parentRef };
};
