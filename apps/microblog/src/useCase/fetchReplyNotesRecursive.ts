import { type DocumentLoader, isActor, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { ActorIdentity } from '../adaptor/fedify/actorIdentity.ts';
import type { PostResolverByUri } from '../adaptor/pg/post/postResolverByUri.ts';
import type { RemotePostUpserter } from '../adaptor/pg/post/remotePostUpserter.ts';
import type { RemotePost } from '../domain/post/post.ts';

const MAX_DEPTH = 10;

type LookupObject = (uri: string, options: { documentLoader: DocumentLoader }) => Promise<unknown>;

type Input = Readonly<{
  inReplyToUri: string;
  documentLoader: DocumentLoader;
  lookupObject: LookupObject;
}>;

type Ok = Readonly<{
  fetchedPosts: RemotePost[];
}>;

type Err = never;

export type FetchReplyNotesRecursiveUseCase = Readonly<{
  run: (input: Input) => RA<Ok, Err>;
}>;

type Deps = Readonly<{
  postResolverByUri: PostResolverByUri;
  remotePostUpserter: RemotePostUpserter;
}>;

const create = ({
  postResolverByUri,
  remotePostUpserter,
}: Deps): FetchReplyNotesRecursiveUseCase => {
  const fetchNote = async (
    uri: string,
    documentLoader: DocumentLoader,
    lookupObject: LookupObject,
  ): Promise<{ note: Note; authorIdentity: ActorIdentity } | undefined> => {
    try {
      const result = await lookupObject(uri, { documentLoader });
      if (!(result instanceof Note)) {
        getLogger().debug(`Fetched object is not a Note: ${uri}`);
        return undefined;
      }
      if (!result.id) {
        getLogger().debug(`Note has no id: ${uri}`);
        return undefined;
      }

      const author = await result.getAttribution({ documentLoader });
      if (!author || !isActor(author)) {
        getLogger().debug(`Could not resolve Note author: ${uri}`);
        return undefined;
      }

      const actorIdentityResult = await ActorIdentity.fromFedifyActor(author, { documentLoader });
      if (!actorIdentityResult.ok) {
        getLogger().debug(`Could not parse actor identity: ${uri}`);
        return undefined;
      }

      return {
        note: result,
        authorIdentity: actorIdentityResult.val,
      };
    } catch (error) {
      getLogger().debug(`Failed to fetch note: ${uri} - ${error}`);
      return undefined;
    }
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const { inReplyToUri, documentLoader, lookupObject } = input;
    const fetchedPosts: RemotePost[] = [];
    const visited = new Set<string>();

    let currentUri: string | null = inReplyToUri;
    let depth = 0;

    while (currentUri && depth < MAX_DEPTH) {
      if (visited.has(currentUri)) {
        getLogger().debug(`Already visited: ${currentUri}, stopping to prevent cycle`);
        break;
      }
      visited.add(currentUri);

      // Check if the post already exists in the database
      const existingPostResult = await postResolverByUri.resolve({ uri: currentUri });
      if (existingPostResult.ok && existingPostResult.val) {
        getLogger().debug(`Post already exists in DB: ${currentUri}`);
        // Continue traversing the chain using the existing post's inReplyToUri
        currentUri = existingPostResult.val.inReplyToUri;
        depth++;
        continue;
      }

      // Fetch the note from remote
      const fetchResult = await fetchNote(currentUri, documentLoader, lookupObject);
      if (!fetchResult) {
        getLogger().debug(`Could not fetch note: ${currentUri}, stopping chain`);
        break;
      }

      const { note, authorIdentity } = fetchResult;
      const noteUri = note.id?.href;
      if (!noteUri) {
        break;
      }

      const noteInReplyToUri = note.replyTargetId?.href ?? null;

      // Upsert the remote post
      const upsertResult = await remotePostUpserter.resolve({
        uri: noteUri,
        content: String(note.content ?? ''),
        authorIdentity,
        inReplyToUri: noteInReplyToUri,
      });

      if (upsertResult.ok) {
        fetchedPosts.push(upsertResult.val);
        getLogger().info(`Fetched and stored reply note: ${noteUri}`);
      }

      // Continue with the next note in the chain
      currentUri = noteInReplyToUri;
      depth++;
    }

    if (depth >= MAX_DEPTH) {
      getLogger().debug(`Reached max depth (${MAX_DEPTH}) while fetching reply chain`);
    }

    return RA.ok({ fetchedPosts });
  };

  return { run };
};

export const FetchReplyNotesRecursiveUseCase = {
  create,
} as const;
