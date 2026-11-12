import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { type BlueskyFeedKind, blueskyFeedKindOf } from '../../domain/blueskyFeed/blueskyFeedUri.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyFeedReader, BlueskySavedFeed } from '../../ports/blueskyFeedReader.ts';
import { httpUrlOrNull } from './blueskyPostView.ts';
import { parseBlueskyTimelineResponse } from './blueskyTimelineResponse.ts';

const FEED_POSTS_LIMIT = '30';
const FEED_GENERATORS_CHUNK_SIZE = 25;
const SAVED_FEEDS_PREF_V2 = 'app.bsky.actor.defs#savedFeedsPrefV2';
const SAVED_FEEDS_PREF = 'app.bsky.actor.defs#savedFeedsPref';

const preferencesZodType = z.object({ preferences: z.array(z.unknown()) });
const preferenceTypeZodType = z.looseObject({ $type: z.string() });
const savedFeedsPrefV2ZodType = z.looseObject({ items: z.array(z.unknown()) });
const savedFeedItemZodType = z.looseObject({
  type: z.enum(['feed', 'list', 'timeline']),
  value: z.string(),
  pinned: z.boolean(),
});
const savedFeedsPrefZodType = z.looseObject({ pinned: z.array(z.string()), saved: z.array(z.string()) });
const creatorZodType = z.looseObject({ handle: z.string().min(1) });
const generatorsZodType = z.object({ feeds: z.array(z.unknown()) });
const generatorZodType = z.looseObject({
  uri: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  description: z.string().optional(),
  creator: creatorZodType.optional(),
});
const listResponseZodType = z.looseObject({
  list: z.looseObject({
    name: z.string().optional(),
    avatar: z.string().optional(),
    description: z.string().optional(),
    creator: creatorZodType.optional(),
  }),
});

type SavedFeedEntry = Readonly<{ uri: string; kind: BlueskyFeedKind; pinned: boolean }>;
type FeedMetadata = Readonly<Pick<BlueskySavedFeed, 'displayName' | 'avatar' | 'description' | 'creatorHandle'>>;

const invalidResponse = (operation: string): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'invalid_response',
  message: `${operation} returned an unexpected response`,
});

const textOrUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

const metadataOf = (
  raw: Readonly<{
    name: string | undefined;
    avatar: string | undefined;
    description: string | undefined;
    creatorHandle: string | undefined;
  }>,
): FeedMetadata => ({
  displayName: textOrUndefined(raw.name),
  avatar: httpUrlOrNull(raw.avatar) ?? undefined,
  description: textOrUndefined(raw.description),
  creatorHandle: raw.creatorHandle,
});

const entryOf = (raw: unknown): SavedFeedEntry | undefined => {
  const parsed = savedFeedItemZodType.safeParse(raw);
  if (!parsed.success || parsed.data.type === 'timeline') return undefined;
  const { type, value, pinned } = parsed.data;
  return blueskyFeedKindOf(value) === type ? { uri: value, kind: type, pinned } : undefined;
};

const entriesOfPreferences = (preferences: readonly unknown[]): readonly SavedFeedEntry[] => {
  const typed = preferences.flatMap((raw) => {
    const type = preferenceTypeZodType.safeParse(raw);
    return type.success ? [{ type: type.data.$type, raw }] : [];
  });
  const v2 = savedFeedsPrefV2ZodType.safeParse(typed.find(({ type }) => type === SAVED_FEEDS_PREF_V2)?.raw);
  if (v2.success) return v2.data.items.flatMap((raw) => entryOf(raw) ?? []);
  const legacy = savedFeedsPrefZodType.safeParse(typed.find(({ type }) => type === SAVED_FEEDS_PREF)?.raw);
  if (!legacy.success) return [];
  const pinned = new Set(legacy.data.pinned);
  return [...legacy.data.pinned, ...legacy.data.saved].flatMap((uri) => {
    const kind = blueskyFeedKindOf(uri);
    return kind === undefined ? [] : [{ uri, kind, pinned: pinned.has(uri) }];
  });
};

const uniqueByUri = (entries: readonly SavedFeedEntry[]): readonly SavedFeedEntry[] =>
  entries.filter((entry, index) => entries.findIndex(({ uri }) => uri === entry.uri) === index);

const pinnedFirst = (entries: readonly SavedFeedEntry[]): readonly SavedFeedEntry[] => [
  ...entries.filter(({ pinned }) => pinned),
  ...entries.filter(({ pinned }) => !pinned),
];

const chunksOf = <T>(values: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

export const createBlueskyFeedReader = (
  deps: Readonly<{ client: BlueskyQueryClient; now: () => Instant }>,
): BlueskyFeedReader => {
  const feedMetadata = async (uris: readonly string[]): Promise<ReadonlyMap<string, FeedMetadata>> => {
    const pages = await Promise.all(
      chunksOf(uris, FEED_GENERATORS_CHUNK_SIZE).map(async (feeds) => {
        const response = await deps.client.query('app.bsky.feed.getFeedGenerators', { feeds });
        const parsed = response.ok ? generatorsZodType.safeParse(response.val) : undefined;
        return parsed?.success === true ? parsed.data.feeds : [];
      }),
    );
    return new Map(
      pages.flat().flatMap((raw): [string, FeedMetadata][] => {
        const parsed = generatorZodType.safeParse(raw);
        return parsed.success
          ? [[
            parsed.data.uri,
            metadataOf({
              name: parsed.data.displayName,
              avatar: parsed.data.avatar,
              description: parsed.data.description,
              creatorHandle: parsed.data.creator?.handle,
            }),
          ]]
          : [];
      }),
    );
  };

  const listMetadata = async (uri: string): Promise<FeedMetadata | undefined> => {
    const response = await deps.client.query('app.bsky.graph.getList', { list: uri, limit: '1' });
    const parsed = response.ok ? listResponseZodType.safeParse(response.val) : undefined;
    if (parsed?.success !== true) return undefined;
    const { name, avatar, description, creator } = parsed.data.list;
    return metadataOf({ name, avatar, description, creatorHandle: creator?.handle });
  };

  return {
    listSavedFeeds: async () => {
      const response = await deps.client.query('app.bsky.actor.getPreferences', {});
      if (!response.ok) return response;
      const parsed = preferencesZodType.safeParse(response.val);
      if (!parsed.success) return RA.err(invalidResponse('getPreferences'));
      const entries = pinnedFirst(uniqueByUri(entriesOfPreferences(parsed.data.preferences)));
      const listEntries = entries.filter(({ kind }) => kind === 'list');
      const [feeds, lists] = await Promise.all([
        feedMetadata(entries.filter(({ kind }) => kind === 'feed').map(({ uri }) => uri)),
        Promise.all(listEntries.map(({ uri }) => listMetadata(uri))),
      ]);
      const listsByUri = new Map(listEntries.map(({ uri }, index) => [uri, lists[index]]));
      return RA.ok({
        feeds: entries.map((entry): BlueskySavedFeed => ({
          ...entry,
          ...(entry.kind === 'feed' ? feeds.get(entry.uri) : listsByUri.get(entry.uri)),
        })),
      });
    },
    getFeedPosts: async ({ uri, cursor }) => {
      const kind = blueskyFeedKindOf(uri);
      if (kind === undefined) {
        return RA.err({
          type: 'BlueskyClientError',
          kind: 'invalid_response',
          message: 'getFeedPosts received an unexpected uri',
        });
      }
      const response = await deps.client.query(
        kind === 'feed' ? 'app.bsky.feed.getFeed' : 'app.bsky.feed.getListFeed',
        {
          [kind === 'feed' ? 'feed' : 'list']: uri,
          limit: FEED_POSTS_LIMIT,
          ...(cursor === undefined ? {} : { cursor }),
        },
      );
      if (!response.ok) return response;
      const parsed = parseBlueskyTimelineResponse(response.val, deps.now());
      return parsed.ok
        ? RA.ok({ items: parsed.val.items, cursor: parsed.val.cursor })
        : RA.err(invalidResponse('getFeedPosts'));
    },
  };
};
