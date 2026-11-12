import { RA } from '@iwasa-kosui/result';

import { blueskyFeedUriOf, isBlueskyDid, parseBlueskyFeedUrl } from '../domain/blueskyFeed/blueskyFeedUri.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import { type BlueskyFeedNotFound, type BlueskyFeedReader, isBlueskyFeedNotFound } from '../ports/blueskyFeedReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ url: string }>;

export type BlueskyFeedUrlInvalid = Readonly<{ type: 'BlueskyFeedUrlInvalid' }>;

type Err = BlueskyClientError | BlueskyFeedNotFound | BlueskyFeedUrlInvalid;

export type ResolveBlueskyFeedUrlUseCase = UseCase<Input, Readonly<{ uri: string }>, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'resolveHandle'> }>;

const create = ({ reader }: Deps): ResolveBlueskyFeedUrlUseCase => ({
  run: async ({ url }) => {
    const parsed = parseBlueskyFeedUrl(url);
    if (parsed === undefined) return RA.err({ type: 'BlueskyFeedUrlInvalid' });
    if (isBlueskyDid(parsed.actor)) return RA.ok({ uri: blueskyFeedUriOf(parsed.actor, parsed.kind, parsed.rkey) });
    const did = await reader.resolveHandle(parsed.actor);
    if (!did.ok) return RA.err(isBlueskyFeedNotFound(did.err) ? { type: 'BlueskyFeedNotFound' } : did.err);
    return RA.ok({ uri: blueskyFeedUriOf(did.val, parsed.kind, parsed.rkey) });
  },
});

export const ResolveBlueskyFeedUrlUseCase = {
  create,
} as const;
