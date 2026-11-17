import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type {
  Interactor,
  ReactionGroup,
  StoredPostInteractionsResolver,
} from '../../../domain/postInteraction/postInteractions.ts';
import type { IoriD1Db } from '../client.ts';
import {
  actorsTable,
  emojiReactsTable,
  likesTable,
  localActorsTable,
  remoteActorsTable,
  repostsTable,
  usersTable,
} from '../schema.ts';

const LIMIT = 80;

type ActorRow = Readonly<{
  actorId: string;
  uri: string;
  logoUri: string | null;
  localUsername: string | null;
  localDisplayName: string | null;
  remoteUrl: string | null;
  remoteUsername: string | null;
  remoteDisplayName: string | null;
}>;

const actorColumns = {
  actorId: actorsTable.actorId,
  uri: actorsTable.uri,
  logoUri: actorsTable.logoUri,
  localUsername: usersTable.username,
  localDisplayName: localActorsTable.displayName,
  remoteUrl: remoteActorsTable.url,
  remoteUsername: remoteActorsTable.username,
  remoteDisplayName: remoteActorsTable.displayName,
} as const;

const parseUrl = (value: string | null): URL | undefined => {
  if (value === null) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
};

const toInteractor = (row: ActorRow): Interactor => {
  const uri = parseUrl(row.uri);
  const host = uri?.host ?? '';
  if (row.localUsername !== null) {
    return {
      actorId: row.actorId as ActorId,
      isLocal: true,
      name: nonEmpty(row.localDisplayName) ?? row.localUsername,
      acct: `${row.localUsername}@${host}`,
      avatarUrl: row.logoUri,
      url: row.uri,
    };
  }
  const username = row.remoteUsername
    ?? uri?.pathname.split('/').filter((segment) => segment.length > 0).at(-1)
    ?? host;
  return {
    actorId: row.actorId as ActorId,
    isLocal: false,
    name: nonEmpty(row.remoteDisplayName) ?? username,
    acct: `${username}@${parseUrl(row.remoteUrl)?.host ?? host}`,
    avatarUrl: row.logoUri,
    url: row.remoteUrl ?? row.uri,
  };
};

export const createD1StoredPostInteractionsResolver = (db: IoriD1Db): StoredPostInteractionsResolver => ({
  resolve: async ({ postId }: { postId: PostId }) => {
    const [likes, reposts, reactions] = await Promise.all([
      db.select(actorColumns).from(likesTable)
        .innerJoin(actorsTable, eq(likesTable.actorId, actorsTable.actorId))
        .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
        .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
        .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
        .where(eq(likesTable.postId, postId))
        .orderBy(desc(likesTable.createdAt), desc(likesTable.likeId))
        .limit(LIMIT),
      db.select(actorColumns).from(repostsTable)
        .innerJoin(actorsTable, eq(repostsTable.actorId, actorsTable.actorId))
        .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
        .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
        .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
        .where(eq(repostsTable.postId, postId))
        .orderBy(desc(repostsTable.createdAt), desc(repostsTable.repostId))
        .limit(LIMIT),
      db.select({ ...actorColumns, emoji: emojiReactsTable.emoji, emojiImageUrl: emojiReactsTable.emojiImageUrl })
        .from(emojiReactsTable)
        .innerJoin(actorsTable, eq(emojiReactsTable.actorId, actorsTable.actorId))
        .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
        .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
        .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
        .where(eq(emojiReactsTable.postId, postId))
        .orderBy(desc(emojiReactsTable.createdAt), desc(emojiReactsTable.emojiReactId))
        .limit(LIMIT),
    ]);

    const groups = new Map<string, { emojiImageUrl: string | null; actors: Interactor[] }>();
    for (const row of reactions) {
      const group = groups.get(row.emoji) ?? { emojiImageUrl: row.emojiImageUrl, actors: [] };
      group.emojiImageUrl ??= row.emojiImageUrl;
      group.actors.push(toInteractor(row));
      groups.set(row.emoji, group);
    }

    return RA.ok({
      likes: likes.map(toInteractor),
      reposts: reposts.map(toInteractor),
      reactions: [...groups].map(([emoji, group]): ReactionGroup => ({ emoji, ...group })),
    });
  },
});
