import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import { createCreatePostUseCase } from '../createPost.ts';
import {
  createMockAcceptedRelaysResolver,
  createMockActorResolverByUserId,
  createMockLinkPreviewCreatedStore,
  createMockOgpFetcher,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

describe('createCreatePostUseCase', () => {
  it('creates a post with an injected Worker origin without reading process.env', async () => {
    const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as User['username'] };
    const session: Session = {
      sessionId: crypto.randomUUID() as Session['sessionId'],
      userId: user.id,
      expires: (Date.now() + 60_000) as Session['expires'],
    };
    const actor: LocalActor = {
      id: crypto.randomUUID() as LocalActor['id'],
      userId: user.id,
      uri: 'https://worker.test/users/kosui',
      inboxUrl: 'https://worker.test/inbox',
      type: 'local',
    };
    const sessionResolver = createMockSessionResolver();
    const userResolver = createMockUserResolver();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const postCreatedStore = createMockPostCreatedStore();
    sessionResolver.setSession(session);
    userResolver.setUser(user);
    actorResolverByUserId.setActor(actor);

    const useCase = createCreatePostUseCase({
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      postCreatedStore,
      postImageCreatedStore: createMockPostImageCreatedStore(),
      timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
      linkPreviewCreatedStore: createMockLinkPreviewCreatedStore(),
      ogpFetcher: createMockOgpFetcher(),
      acceptedRelaysResolver: createMockAcceptedRelaysResolver(),
      origin: 'https://worker.test',
    });

    const result = await useCase.run({
      sessionId: session.sessionId,
      content: 'Posted from the Worker',
      imageUrls: ['/uploads/image.webp'],
      ctx: createMockRequestContext(),
    });

    expect(result.ok).toBe(true);
    expect(postCreatedStore.items).toHaveLength(1);
  });
});
