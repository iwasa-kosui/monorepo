import type { Context } from '@fedify/fedify';
import { Service, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActorCreatedStore } from '../../domain/actor/createLocalActor.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import type {
  LocalActorProfileUpdated,
  LocalActorProfileUpdatedStore,
} from '../../domain/actor/updateLocalActorProfile.ts';
import { AiAgentBot } from '../../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { User } from '../../domain/user/user.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { EnsureAiAgentBotUseCase } from '../ensureAiAgentBot.ts';
import {
  createMockActorResolverByUserId,
  createMockFedifyContext,
  createMockLogoUriUpdatedStore,
  createMockUserCreatedStore,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

const ORIGIN = 'https://example.com';
const AVATAR_URL = `${ORIGIN}${AiAgentBot.images.avatarPath}`;

const botUser: User = {
  id: UserId.orThrow('0192f6a0-0000-7000-8000-0000000000b1'),
  username: Username.orThrow(AiAgentBot.username),
};

const botActor = (overrides: Partial<LocalActor> = {}): LocalActor => ({
  id: ActorId.orThrow('0192f6a0-0000-7000-8000-0000000000b0'),
  userId: botUser.id,
  uri: `${ORIGIN}/users/${AiAgentBot.username}`,
  inboxUrl: `${ORIGIN}/users/${AiAgentBot.username}/inbox`,
  type: 'local',
  ...overrides,
});

const setup = (actor: LocalActor | undefined) => {
  const userResolverByUsername = createMockUserResolverByUsername();
  const actorResolverByUserId = createMockActorResolverByUserId();
  if (actor !== undefined) {
    userResolverByUsername.setUser(botUser);
    actorResolverByUserId.setActor(actor);
  }
  const profileEvents: LocalActorProfileUpdated[] = [];
  const localActorProfileUpdatedStore: LocalActorProfileUpdatedStore = {
    store: (...events) => {
      profileEvents.push(...events);
      return RA.ok(undefined);
    },
  };
  const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
  const ctx = {
    ...createMockFedifyContext(),
    origin: ORIGIN,
    getOutboxUri: (identifier: string) => new URL(`${ORIGIN}/users/${identifier}/outbox`),
  } as unknown as Context<unknown>;
  const useCase = EnsureAiAgentBotUseCase.create({
    userResolverByUsername,
    userCreatedStore: createMockUserCreatedStore(),
    localActorCreatedStore: {
      store: (...events) => {
        for (const event of events) actorResolverByUserId.setActor(event.aggregateState);
        return RA.ok(undefined);
      },
    } satisfies LocalActorCreatedStore,
    actorResolverByUserId,
    localActorProfileUpdatedStore,
    logoUriUpdatedStore,
    now: () => Instant.orThrow(1_700_000_000_000),
  });
  return { useCase, ctx, profileEvents, logoUriUpdatedStore };
};

describe('EnsureAiAgentBotUseCase', () => {
  it('既存の bot の表示名とアイコンが古ければ直し、フォロワーに Update を送る', async () => {
    const { useCase, ctx, profileEvents, logoUriUpdatedStore } = setup(
      botActor({ displayName: 'agent (AI)', bio: AiAgentBot.profile.bio }),
    );

    const result = await useCase.run({ ctx });

    expect(result.val.actor.displayName).toBe(AiAgentBot.profile.displayName);
    expect(result.val.actor.logoUri).toBe(AVATAR_URL);
    expect(profileEvents.map((event) => event.aggregateState.displayName)).toEqual([AiAgentBot.profile.displayName]);
    expect(logoUriUpdatedStore.items.map((event) => event.eventPayload.logoUri)).toEqual([AVATAR_URL]);

    const sendActivity = vi.mocked(ctx.sendActivity);
    expect(sendActivity).toHaveBeenCalledTimes(1);
    const activity = sendActivity.mock.calls[0]?.[2];
    expect(activity).toBeInstanceOf(Update);
    const object = await (activity as Update).getObject();
    expect(object).toBeInstanceOf(Service);
    const service = object as Service;
    expect(service.name?.toString()).toBe(AiAgentBot.profile.displayName);
    expect((await service.getIcon())?.url?.toString()).toBe(AVATAR_URL);
    expect((await service.getImage())?.url?.toString()).toBe(`${ORIGIN}${AiAgentBot.images.headerPath}`);
  });

  it('プロフィールが定めたとおりなら、何も保存せず Update も送らない', async () => {
    const { useCase, ctx, profileEvents, logoUriUpdatedStore } = setup(
      botActor({ ...AiAgentBot.profile, logoUri: AVATAR_URL }),
    );

    await useCase.run({ ctx });

    expect(profileEvents).toEqual([]);
    expect(logoUriUpdatedStore.items).toEqual([]);
    expect(ctx.sendActivity).not.toHaveBeenCalled();
  });

  it('bot を作ったばかりのときはプロフィールを設定するが、フォロワーがいないので Update は送らない', async () => {
    const { useCase, ctx, logoUriUpdatedStore } = setup(undefined);

    const result = await useCase.run({ ctx });

    expect(result.val.created).toBe(true);
    expect(result.val.actor.displayName).toBe(AiAgentBot.profile.displayName);
    expect(logoUriUpdatedStore.items.map((event) => event.eventPayload.logoUri)).toEqual([AVATAR_URL]);
    expect(ctx.sendActivity).not.toHaveBeenCalled();
  });
});
