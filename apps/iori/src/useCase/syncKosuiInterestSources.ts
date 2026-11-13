import { RA } from '@iwasa-kosui/result';

import { parseFeed } from '../adaptor/feed/parseFeed.ts';
import type { SafeFetcher } from '../adaptor/http/safeFetch.ts';
import { Instant } from '../domain/instant/instant.ts';
import type {
  InterestSourceContentChangedStore,
  InterestSourceCreatedStore,
  InterestSourceDeletedStore,
  InterestSourceEmbeddedStore,
  InterestSourceKind,
  InterestSourceParseError,
  InterestSourcesResolverByUserIdAndKindIncludingDeleted,
  InterestSourcesResolverByUserIdAndKindsPendingEmbedding,
} from '../domain/interestSource/interestSource.ts';
import { type DesiredInterestSource, InterestSourceDiff } from '../domain/interestSource/interestSourceDiff.ts';
import {
  buildKosuiPostText,
  buildKosuiSummaryText,
  classifyKosuiEntry,
} from '../domain/interestSource/kosuiFeedText.ts';
import type { UserId } from '../domain/user/userId.ts';
import { sha256Hex } from '../helper/sha256.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import { runWithConcurrency } from './collectFeedEntries.ts';
import { applyInterestSourceDiff } from './helper/applyInterestSourceDiff.ts';
import { embedInterestSources, type EmbedTarget } from './helper/embedInterestSources.ts';
import type { UseCase } from './useCase.ts';

export const KOSUI_ORIGIN = 'https://kosui.me';
export const KOSUI_FEED_URL = `${KOSUI_ORIGIN}/feed.xml`;
export const KOSUI_FEED_MAX_ITEMS = 100;
export const KOSUI_MARKDOWN_FETCH_CONCURRENCY = 4;
const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 } as const;
const KOSUI_KINDS = ['kosui_post', 'kosui_talk', 'kosui_external'] as const satisfies ReadonlyArray<InterestSourceKind>;

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{ created: number; changed: number; deleted: number; embedded: number }>;

type KosuiFeedUnavailableError = Readonly<{
  type: 'KosuiFeedUnavailableError';
  message: string;
}>;

const KosuiFeedUnavailableError = {
  create: (reason: string): KosuiFeedUnavailableError => ({
    type: 'KosuiFeedUnavailableError',
    message: `The kosui.me feed could not be read: ${reason}`,
  }),
} as const;

type Err = KosuiFeedUnavailableError | InterestSourceParseError;

export type SyncKosuiInterestSourcesUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  interestSourcesResolverByUserIdAndKindIncludingDeleted: InterestSourcesResolverByUserIdAndKindIncludingDeleted;
  interestSourcesResolverByUserIdAndKindsPendingEmbedding: InterestSourcesResolverByUserIdAndKindsPendingEmbedding;
  interestSourceCreatedStore: InterestSourceCreatedStore;
  interestSourceContentChangedStore: InterestSourceContentChangedStore;
  interestSourceDeletedStore: InterestSourceDeletedStore;
  interestSourceEmbeddedStore: InterestSourceEmbeddedStore;
  safeFetcher: Pick<SafeFetcher, 'fetchText'>;
  textEmbedder: TextEmbedder | undefined;
  now: () => Instant;
}>;

type KosuiEntry = Readonly<{
  kind: (typeof KOSUI_KINDS)[number];
  text: string;
  desired: DesiredInterestSource;
}>;

const isKosuiUrl = (url: string): boolean => URL.canParse(url) && new URL(url).origin === KOSUI_ORIGIN;

const keyOf = (kind: InterestSourceKind, ref: string): string => `${kind}\n${ref}`;

const create = ({
  interestSourcesResolverByUserIdAndKindIncludingDeleted,
  interestSourcesResolverByUserIdAndKindsPendingEmbedding,
  interestSourceCreatedStore,
  interestSourceContentChangedStore,
  interestSourceDeletedStore,
  interestSourceEmbeddedStore,
  safeFetcher,
  textEmbedder,
  now,
}: Deps): SyncKosuiInterestSourcesUseCase => {
  const fetchMarkdown = async (url: string): Promise<string | undefined> => {
    const fetched = await safeFetcher.fetchText(`${url}.md`, FETCH_OPTIONS);
    if (fetched.ok && fetched.val.body !== undefined) return fetched.val.body;
    console.warn('iori interest sources: fetching the markdown failed, so the description is used instead.', {
      url,
      errorMessage: fetched.ok ? 'The response had no body.' : fetched.err.message,
    });
    return undefined;
  };

  const run = async ({ userId }: Input): RA<Ok, Err> => {
    const fetched = await safeFetcher.fetchText(KOSUI_FEED_URL, FETCH_OPTIONS);
    if (!fetched.ok) return RA.err(KosuiFeedUnavailableError.create(fetched.err.message));
    if (fetched.val.body === undefined) return RA.err(KosuiFeedUnavailableError.create('The response had no body.'));
    const parsed = parseFeed(fetched.val.body, { maxItems: KOSUI_FEED_MAX_ITEMS });
    if (!parsed.ok) return RA.err(KosuiFeedUnavailableError.create(parsed.err.message));
    if (parsed.val.length === 0) return RA.err(KosuiFeedUnavailableError.create('The feed has no items.'));

    const seenUrls = new Set<string>();
    const items = parsed.val.filter((item) => !seenUrls.has(item.url) && seenUrls.add(item.url));
    const markdowns = new Map<string, string>();
    const markdownFailedUrls = new Set<string>();
    await runWithConcurrency(
      items.filter((item) => classifyKosuiEntry(item.title).kind === 'kosui_post' && isKosuiUrl(item.url)),
      KOSUI_MARKDOWN_FETCH_CONCURRENCY,
      async (item) => {
        const markdown = await fetchMarkdown(item.url);
        if (markdown !== undefined) markdowns.set(item.url, markdown);
        else markdownFailedUrls.add(item.url);
      },
    );
    const timestamp = now();
    const entries: KosuiEntry[] = await Promise.all(items.map(async (item): Promise<KosuiEntry> => {
      const { kind, title } = classifyKosuiEntry(item.title);
      const markdown = markdowns.get(item.url);
      const text = kind === 'kosui_post' && markdown !== undefined
        ? buildKosuiPostText(title, markdown)
        : buildKosuiSummaryText(title, item.description);
      const published = item.publishedAt === null ? undefined : Instant.of(item.publishedAt.getTime());
      return {
        kind,
        text,
        desired: {
          ref: item.url,
          contentHash: await sha256Hex(text),
          occurredAt: published?.ok ? published.val : timestamp,
        },
      };
    }));

    let created = 0;
    let changed = 0;
    let deleted = 0;
    for (const kind of KOSUI_KINDS) {
      const existing = await interestSourcesResolverByUserIdAndKindIncludingDeleted.resolve({ userId, kind });
      const retainedRefs = new Set(
        existing.val
          .filter((source) => source.deletedAt === null && markdownFailedUrls.has(source.ref))
          .map((source) => source.ref),
      );
      const diff = InterestSourceDiff.compute(
        existing.val.filter((source) => !retainedRefs.has(source.ref)),
        entries
          .filter((entry) => entry.kind === kind && !retainedRefs.has(entry.desired.ref))
          .map((entry) => entry.desired),
      );
      const applied = await applyInterestSourceDiff(
        { interestSourceCreatedStore, interestSourceContentChangedStore, interestSourceDeletedStore, now },
        { userId, kind },
        diff,
      );
      if (!applied.ok) return applied;
      created += applied.val.created.length;
      changed += applied.val.changed.length;
      deleted += applied.val.deleted;
    }

    let embedded = 0;
    if (textEmbedder !== undefined) {
      const pending = await interestSourcesResolverByUserIdAndKindsPendingEmbedding.resolve({
        userId,
        kinds: KOSUI_KINDS,
        limit: KOSUI_FEED_MAX_ITEMS,
      });
      const textByKey = new Map(entries.map((entry) => [keyOf(entry.kind, entry.desired.ref), entry]));
      const targets = pending.val.flatMap((source): EmbedTarget[] => {
        const entry = textByKey.get(keyOf(source.kind, source.ref));
        return entry !== undefined && entry.desired.contentHash === source.contentHash
          ? [{ source, text: entry.text }]
          : [];
      });
      const result = await embedInterestSources({ textEmbedder, interestSourceEmbeddedStore, now }, targets);
      if (result.ok) embedded = result.val;
      else {console.error('iori interest sources: embedding the kosui.me entries failed.', {
          errorMessage: result.err.message,
        });}
    }
    return RA.ok({ created, changed, deleted, embedded });
  };

  return { run };
};

export const SyncKosuiInterestSourcesUseCase = {
  create,
} as const;
