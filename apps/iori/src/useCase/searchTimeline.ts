import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId, ActorsResolverByFollowerId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { MutedActorIdsResolverByUserId } from '../domain/mute/mute.ts';
import type { PostId } from '../domain/post/postId.ts';
import { SearchTerm } from '../domain/timelineSearch/searchTerm.ts';
import { SearchTerms } from '../domain/timelineSearch/searchTerms.ts';
import type {
  TimelineSearchCandidate,
  TimelineSearchCandidatesResolver,
} from '../domain/timelineSearch/timelineSearchCandidatesResolver.ts';
import type { TimelineSearchQuery } from '../domain/timelineSearch/timelineSearchQuery.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TextGenerator } from '../ports/textGenerator.ts';
import { resolveLocalActorWith } from './helper/resolve.ts';
import { expandQuery } from './timelineSearch/queryExpansion.ts';
import type { UseCase } from './useCase.ts';

const CANDIDATE_LIMIT = 200;
const ORIGINAL_TERM_SCORE = 2;
const EXPANDED_TERM_SCORE = 1;
const MIN_EXPANDABLE_QUERY_CHARS = 2;

type Input = Readonly<{
  userId: UserId;
  query: TimelineSearchQuery;
  onlyActorId?: ActorId;
}>;

export type TimelineSearchExpansion = 'expanded' | 'skipped' | 'failed';

type Ok = Readonly<{
  viewerActorId: ActorId;
  postIds: ReadonlyArray<PostId>;
  terms: Readonly<{
    original: ReadonlyArray<SearchTerm>;
    expanded: ReadonlyArray<SearchTerm>;
  }>;
  droppedOriginal: ReadonlyArray<string>;
  expansion: TimelineSearchExpansion;
}>;

type Err = UserNotFoundError;

export type SearchTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverByUserId: ActorResolverByUserId;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  mutedActorIdsResolverByUserId: MutedActorIdsResolverByUserId;
  textGenerator?: TextGenerator;
  expansionTimeoutMs?: number;
  timelineSearchCandidatesResolver: TimelineSearchCandidatesResolver;
  htmlToPlainText: (html: string, maxChars: number) => string;
}>;

const splitQuery = (text: string): Readonly<{ terms: SearchTerm[]; dropped: string[] }> => {
  const terms: SearchTerm[] = [];
  const dropped: string[] = [];
  for (const word of text.split(/\s+/).filter((value) => value.length > 0)) {
    const term = SearchTerm.of(word);
    if (term.ok) terms.push(term.val);
    else dropped.push(word.trim());
  }
  return { terms, dropped };
};

const isWorthExpanding = (text: string): boolean => {
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();
  return Array.from(trimmed).length >= MIN_EXPANDABLE_QUERY_CHARS
    && !lowered.startsWith('http://')
    && !lowered.startsWith('https://')
    && !trimmed.startsWith('@');
};

const create = ({
  actorResolverByUserId,
  actorsResolverByFollowerId,
  mutedActorIdsResolverByUserId,
  textGenerator,
  expansionTimeoutMs,
  timelineSearchCandidatesResolver,
  htmlToPlainText,
}: Deps): SearchTimelineUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const expand = async (
    text: string,
  ): Promise<Readonly<{ expansion: TimelineSearchExpansion; terms: SearchTerm[] }>> => {
    if (textGenerator === undefined || !isWorthExpanding(text)) return { expansion: 'skipped', terms: [] };
    const expanded = await expandQuery(textGenerator, text, expansionTimeoutMs);
    if (expanded.ok) return { expansion: 'expanded', terms: expanded.val };
    console.warn(`timeline search expansion failed: ${expanded.err.type}: ${expanded.err.message.slice(0, 200)}`);
    return { expansion: 'failed', terms: [] };
  };

  const rank = (
    candidates: ReadonlyArray<TimelineSearchCandidate>,
    terms: SearchTerms,
    limit: number,
  ): PostId[] => {
    const keysOf = (list: ReadonlyArray<SearchTerm>) =>
      list.map((term) => SearchTerm.normalizeForMatch(term.normalized));
    const originalKeys = keysOf(terms.original);
    const expandedKeys = keysOf(terms.expanded);
    return candidates
      .map((candidate) => {
        const plain = SearchTerm.normalizeForMatch(htmlToPlainText(candidate.content, Number.POSITIVE_INFINITY));
        const originalHits = originalKeys.filter((key) => plain.includes(key)).length;
        const expandedHits = expandedKeys.filter((key) => plain.includes(key)).length;
        return {
          candidate,
          score: originalHits * ORIGINAL_TERM_SCORE + expandedHits * EXPANDED_TERM_SCORE,
          hits: originalHits + expandedHits,
        };
      })
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.score - a.score || b.candidate.createdAt - a.candidate.createdAt)
      .slice(0, limit)
      .map(({ candidate }) => candidate.postId);
  };

  const run = async (input: Input) =>
    RA.flow(
      resolveLocalActor(input.userId),
      RA.andThen(async (actor) => {
        const [following, mutedActorIds] = await Promise.all([
          actorsResolverByFollowerId.resolve(actor.id),
          mutedActorIdsResolverByUserId.resolve(input.userId),
        ]);
        if (!following.ok) return following;
        if (!mutedActorIds.ok) return mutedActorIds;
        const mutedActorIdSet = new Set(mutedActorIds.val);
        const actorIds = [actor.id, ...following.val.map((a) => a.id)]
          .filter((id) => !mutedActorIdSet.has(id))
          .filter((id) => input.onlyActorId === undefined || id === input.onlyActorId);
        return RA.ok({ viewerActorId: actor.id, actorIds });
      }),
      RA.andThen(async ({ viewerActorId, actorIds }) => {
        const { terms: originalTerms, dropped: droppedOriginal } = splitQuery(input.query.text);
        const output = (
          postIds: ReadonlyArray<PostId>,
          terms: SearchTerms,
          expansion: TimelineSearchExpansion,
        ): Ok => ({
          viewerActorId,
          postIds,
          terms: { original: terms.original, expanded: terms.expanded },
          droppedOriginal,
          expansion,
        });
        if (actorIds.length === 0) {
          return RA.ok(
            output([], SearchTerms.create({ original: originalTerms, expanded: [] }), 'skipped'),
          );
        }
        const { expansion, terms: expandedTerms } = await expand(input.query.text);
        const terms = SearchTerms.create({
          original: originalTerms,
          expanded: expandedTerms,
        });
        const patterns = SearchTerms.toPatterns(terms);
        if (patterns.length === 0) return RA.ok(output([], terms, expansion));
        return RA.flow(
          timelineSearchCandidatesResolver.resolve({
            actorIds,
            terms: patterns,
            limit: CANDIDATE_LIMIT,
          }),
          RA.map((candidates) => output(rank(candidates, terms, input.query.limit), terms, expansion)),
        );
      }),
    );

  return { run };
};

export const createSearchTimelineUseCase = (deps: Deps): SearchTimelineUseCase => create(deps);

export const SearchTimelineUseCase = {
  create,
} as const;
