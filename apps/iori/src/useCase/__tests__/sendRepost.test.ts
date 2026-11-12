import { Note, Person, PUBLIC_COLLECTION } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemotePost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendRepostUseCase } from '../sendRepost.ts';
import {
  createMockActorResolverByUserId,
  createMockPostResolver,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

describe('SendRepostUseCase のリモート投稿のブースト', () => {
  const setup = (noteOverrides: ConstructorParameters<typeof Note>[0] = {}) => {
    const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
    const session: Session = {
      sessionId: crypto.randomUUID() as Session['sessionId'],
      userId: user.id,
      expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
    };
    const actor: LocalActor = {
      id: crypto.randomUUID() as LocalActor['id'],
      userId: user.id,
      uri: 'https://example.com/users/kosui',
      inboxUrl: 'https://example.com/inbox',
      type: 'local',
      logoUri: undefined,
    };
    const remotePost: RemotePost = {
      type: 'remote',
      summary: null,
      sensitive: false,
      postId: crypto.randomUUID() as PostId,
      actorId: crypto.randomUUID() as RemotePost['actorId'],
      content: 'remote',
      createdAt: Date.now() as RemotePost['createdAt'],
      uri: 'https://remote.example/notes/1',
      inReplyToUri: null,
      visibility: 'public',
    };
    const sessionResolver = createMockSessionResolver();
    sessionResolver.setSession(session);
    const userResolver = createMockUserResolver();
    userResolver.setUser(user);
    const actorResolverByUserId = createMockActorResolverByUserId();
    actorResolverByUserId.setActor(actor);
    const postResolver = createMockPostResolver();
    postResolver.setPost(remotePost);
    const remotePostUpserter = { resolve: vi.fn(async () => RA.ok(remotePost)) };
    const deps = {
      origin: 'https://example.com',
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      repostCreatedStore: { store: vi.fn(async () => RA.ok(undefined)) },
      repostResolver: { resolve: vi.fn(async () => RA.ok(undefined)) },
      remotePostUpserter,
      timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
      postResolver,
      articleResolverByRootPostId: { resolve: vi.fn(async () => RA.ok(undefined)) },
    };
    const author = new Person({
      id: new URL('https://remote.example/users/alice'),
      preferredUsername: 'alice',
      inbox: new URL('https://remote.example/users/alice/inbox'),
    });
    const note = new Note({
      id: new URL(remotePost.uri),
      content: '<p>remote</p>',
      attribution: author,
      tos: [PUBLIC_COLLECTION],
      ...noteOverrides,
    });
    const ctx = Object.assign(createMockRequestContext(), {
      getFollowersUri: vi.fn((username: string) => new URL(`https://example.com/users/${username}/followers`)),
      getDocumentLoader: vi.fn(async () => ({})),
      lookupObject: vi.fn(async () => note),
    });
    return { deps, session, remotePost, remotePostUpserter, ctx };
  };

  it('引用を持つ投稿をブーストすると、引用先の URI を remotePostUpserter に渡す', async () => {
    const { deps, session, remotePost, remotePostUpserter, ctx } = setup({
      quote: new URL('https://other.example/notes/quoted'),
    });

    const result = await SendRepostUseCase.create(deps as never).run({
      sessionId: session.sessionId,
      postId: remotePost.postId,
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ uri: remotePost.uri, quoteUri: 'https://other.example/notes/quoted' }),
    );
  });
});
