import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId, ActorsResolverByFollowerId } from '../domain/actor/actor.ts';
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

type Input = Readonly<{
  userId: UserId;
  query: TimelineSearchQuery;
}>;

export type TimelineSearchExpansion = 'expanded' | 'skipped' | 'failed';

type Ok = Readonly<{
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

const create = ({
  actorResolverByUserId,
  actorsResolverByFollowerId,
  mutedActorIdsResolverByUserId,
  textGenerator,
  timelineSearchCandidatesResolver,
  htmlToPlainText,
}: Deps): SearchTimelineUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const expand = async (
    text: string,
  ): Promise<Readonly<{ expansion: TimelineSearchExpansion; terms: SearchTerm[] }>> => {
    if (textGenerator === undefined) return { expansion: 'skipped', terms: [] };
    const expanded = await expandQuery(textGenerator, text);
    return expanded.ok
      ? { expansion: 'expanded', terms: expanded.val }
      : { expansion: 'failed', terms: [] };
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
          .filter((id) => !mutedActorIdSet.has(id));
        return RA.ok(actorIds);
      }),
      RA.andThen(async (actorIds) => {
        const { expansion, terms: expandedTerms } = await expand(input.query.text);
        const { terms: originalTerms, dropped: droppedOriginal } = splitQuery(input.query.text);
        const terms = SearchTerms.create({
          original: originalTerms,
          expanded: expandedTerms,
        });
        const patterns = SearchTerms.toPatterns(terms);
        const output = (postIds: ReadonlyArray<PostId>): Ok => ({
          postIds,
          terms: { original: terms.original, expanded: terms.expanded },
          droppedOriginal,
          expansion,
        });
        if (patterns.length === 0) return RA.ok(output([]));
        return RA.flow(
          timelineSearchCandidatesResolver.resolve({
            actorIds,
            terms: patterns,
            limit: CANDIDATE_LIMIT,
          }),
          RA.map((candidates) => output(rank(candidates, terms, input.query.limit))),
        );
      }),
    );

  return { run };
};

export const createSearchTimelineUseCase = (deps: Deps): SearchTimelineUseCase => create(deps);

export const SearchTimelineUseCase = {
  create,
} as const;
