import type { Agg } from '../aggregate/index.ts';
import type { PostId } from './postId.ts';
import type { Visibility } from './visibility.ts';

export type DirectPostParticipantsResolverByPostId = Agg.Resolver<PostId, ReadonlyArray<string>>;

const of = (
  visibility: Visibility | null,
  actorUris: ReadonlyArray<string | undefined>,
): ReadonlyArray<string> =>
  visibility === 'direct'
    ? [...new Set(actorUris.filter((uri): uri is string => uri !== undefined))]
    : [];

export const DirectPostParticipants = { of } as const;
