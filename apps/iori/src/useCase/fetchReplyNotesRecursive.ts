import { Note } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type {
  LocalPostResolverByUri,
  PostResolverByUri,
  RemotePost,
  RemotePostIdentity,
  RemotePostUpserter,
} from '../domain/post/post.ts';
import { toRemotePostIdentity } from './helper/remoteNoteIdentity.ts';

const MAX_DEPTH = 10;

type LookupObject = (uri: string, options: { documentLoader: DocumentLoader }) => Promise<unknown>;

type Input = Readonly<{
  inReplyToUri: string;
  documentLoader: DocumentLoader;
  lookupObject: LookupObject;
  shouldSave?: (identity: RemotePostIdentity) => boolean | Promise<boolean>;
  maxDepth?: number;
}>;

type Ok = Readonly<{
  fetchedPosts: RemotePost[];
}>;

type Err = never;

export type FetchReplyNotesRecursiveUseCase = Readonly<{
  run: (input: Input) => RA<Ok, Err>;
}>;

type Deps = Readonly<{
  origin: string;
  postResolverByUri: PostResolverByUri;
  localPostResolverByUri: LocalPostResolverByUri;
  remotePostUpserter: RemotePostUpserter;
  isBlockedUri: (uri: string) => boolean;
}>;

const create = ({
  origin,
  postResolverByUri,
  localPostResolverByUri,
  remotePostUpserter,
  isBlockedUri,
}: Deps): FetchReplyNotesRecursiveUseCase => {
  const fetchNote = async (
    uri: string,
    documentLoader: DocumentLoader,
    lookupObject: LookupObject,
  ): Promise<RemotePostIdentity | undefined> => {
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
      return await toRemotePostIdentity(result, { origin, documentLoader, isBlockedUri });
    } catch (error) {
      getLogger().debug(`Failed to fetch note: ${uri} - ${error}`);
      return undefined;
    }
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const { inReplyToUri, documentLoader, lookupObject, shouldSave, maxDepth = MAX_DEPTH } = input;
    const fetchedPosts: RemotePost[] = [];
    const visited = new Set<string>();

    let currentUri: string | null = inReplyToUri;
    let depth = 0;

    while (currentUri && depth < maxDepth) {
      if (visited.has(currentUri)) {
        getLogger().debug(`Already visited: ${currentUri}, stopping to prevent cycle`);
        break;
      }
      visited.add(currentUri);

      // Check if the post already exists in the database (as remote post)
      const existingRemotePostResult = await postResolverByUri.resolve({ uri: currentUri });
      if (existingRemotePostResult.ok && existingRemotePostResult.val) {
        getLogger().debug(`Remote post already exists in DB: ${currentUri}`);
        // Continue traversing the chain using the existing post's inReplyToUri
        currentUri = existingRemotePostResult.val.inReplyToUri;
        depth++;
        continue;
      }

      // Check if the post already exists as a local post
      const existingLocalPostResult = await localPostResolverByUri.resolve({ uri: currentUri });
      if (existingLocalPostResult.ok && existingLocalPostResult.val) {
        getLogger().debug(`Local post already exists in DB: ${currentUri}`);
        // Continue traversing the chain using the existing local post's inReplyToUri
        currentUri = existingLocalPostResult.val.inReplyToUri;
        depth++;
        continue;
      }

      if (isBlockedUri(currentUri)) {
        getLogger().debug(`Skipped a blocked domain: ${currentUri}, stopping chain`);
        break;
      }

      // Fetch the note from remote
      const fetchResult = await fetchNote(currentUri, documentLoader, lookupObject);
      if (!fetchResult) {
        getLogger().debug(`Could not fetch note: ${currentUri}, stopping chain`);
        break;
      }

      const noteUri = fetchResult.uri;
      const noteInReplyToUri = fetchResult.inReplyToUri ?? null;

      if (shouldSave !== undefined && !(await shouldSave(fetchResult))) {
        getLogger().debug(`Skipped saving note: ${noteUri}, stopping chain`);
        break;
      }

      // Upsert the remote post
      const upsertResult = await remotePostUpserter.resolve(fetchResult);

      if (upsertResult.ok) {
        fetchedPosts.push(upsertResult.val);
        getLogger().info(`Fetched and stored reply note: ${noteUri}`);
      }

      // Continue with the next note in the chain
      currentUri = noteInReplyToUri;
      depth++;
    }

    if (depth >= maxDepth) {
      getLogger().debug(`Reached max depth (${maxDepth}) while fetching reply chain`);
    }

    return RA.ok({ fetchedPosts });
  };

  return { run };
};

export const FetchReplyNotesRecursiveUseCase = {
  create,
} as const;
