import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyMutedActorsFetcher } from '../../ports/blueskyMutedActorsFetcher.ts';

export const BLUESKY_MUTES_PAGE_LIMIT = 100;
export const BLUESKY_MUTES_MAX_PAGES = 20;

const didZodType = z.string().startsWith('did:');
const mutesResponseZodType = z.object({
  mutes: z.array(z.looseObject({ did: didZodType })),
  cursor: z.string().optional(),
});
const listMutesResponseZodType = z.object({
  lists: z.array(z.looseObject({ uri: z.string().min(1) })),
  cursor: z.string().optional(),
});
const listResponseZodType = z.object({
  items: z.array(z.looseObject({ subject: z.looseObject({ did: didZodType }) })),
  cursor: z.string().optional(),
});

type Page<T> = Readonly<{ values: readonly T[]; cursor: string | undefined }>;

const invalidResponse = (nsid: string): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'invalid_response',
  message: `${nsid} returned an unexpected response`,
});

/**
 * カーソルが尽きるまでページをたどる。上限に達してもまだ続きがあるときは、
 * 一部だけのミュートで同期するとミュート済みのアカウントを解除扱いにしてしまうため、失敗として返す。
 */
const collectPages = async <T>(
  nsid: string,
  fetchPage: (cursor: string | undefined) => RA<Page<T>, BlueskyClientError>,
): RA<readonly T[], BlueskyClientError> => {
  const values: T[] = [];
  let cursor: string | undefined;
  for (let pages = 0; pages < BLUESKY_MUTES_MAX_PAGES; pages += 1) {
    const page = await fetchPage(cursor);
    if (!page.ok) return page;
    values.push(...page.val.values);
    if (page.val.cursor === undefined || page.val.cursor === cursor || page.val.values.length === 0) {
      return RA.ok(values);
    }
    cursor = page.val.cursor;
  }
  return RA.err({
    type: 'BlueskyClientError',
    kind: 'invalid_response',
    message: `${nsid} returned more than ${BLUESKY_MUTES_MAX_PAGES} pages`,
  });
};

const queryPage = async <T, V>(
  client: BlueskyQueryClient,
  nsid: string,
  params: Readonly<Record<string, string>>,
  cursor: string | undefined,
  schema: z.ZodType<T>,
  toValues: (parsed: T) => readonly V[],
  toCursor: (parsed: T) => string | undefined,
): RA<Page<V>, BlueskyClientError> => {
  const response = await client.query(nsid, {
    ...params,
    limit: String(BLUESKY_MUTES_PAGE_LIMIT),
    ...(cursor === undefined ? {} : { cursor }),
  });
  if (!response.ok) return response;
  const parsed = schema.safeParse(response.val);
  if (!parsed.success) return RA.err(invalidResponse(nsid));
  return RA.ok({ values: toValues(parsed.data), cursor: toCursor(parsed.data) });
};

export const createBlueskyMutedActorsFetcher = (
  deps: Readonly<{ client: BlueskyQueryClient }>,
): BlueskyMutedActorsFetcher => ({
  fetch: async () => {
    const { client } = deps;
    const muted = await collectPages(
      'app.bsky.graph.getMutes',
      (cursor) =>
        queryPage(
          client,
          'app.bsky.graph.getMutes',
          {},
          cursor,
          mutesResponseZodType,
          (parsed) => parsed.mutes.map((actor) => actor.did),
          (parsed) => parsed.cursor,
        ),
    );
    if (!muted.ok) return muted;
    const lists = await collectPages(
      'app.bsky.graph.getListMutes',
      (cursor) =>
        queryPage(
          client,
          'app.bsky.graph.getListMutes',
          {},
          cursor,
          listMutesResponseZodType,
          (parsed) => parsed.lists.map((list) => list.uri),
          (parsed) => parsed.cursor,
        ),
    );
    if (!lists.ok) return lists;
    const dids = new Set(muted.val);
    for (const list of new Set(lists.val)) {
      const members = await collectPages(
        'app.bsky.graph.getList',
        (cursor) =>
          queryPage(
            client,
            'app.bsky.graph.getList',
            { list },
            cursor,
            listResponseZodType,
            (parsed) => parsed.items.map((item) => item.subject.did),
            (parsed) => parsed.cursor,
          ),
      );
      if (!members.ok) return members;
      for (const did of members.val) dids.add(did);
    }
    return RA.ok([...dids]);
  },
});
