import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import {
  type DefaultPostVisibility,
  UserPreferences,
  type UserPreferencesResolverByUserId,
  type UserPreferencesSavedStore,
} from '../domain/userPreferences/userPreferences.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; defaultPostVisibility: DefaultPostVisibility }>;

export type SaveUserPreferencesUseCase = UseCase<Input, UserPreferences, never>;

type Deps = Readonly<{
  userPreferencesResolverByUserId: UserPreferencesResolverByUserId;
  userPreferencesSavedStore: UserPreferencesSavedStore;
}>;

const create = ({
  userPreferencesResolverByUserId,
  userPreferencesSavedStore,
}: Deps): SaveUserPreferencesUseCase => {
  const run = async ({ userId, defaultPostVisibility }: Input) => {
    const now = Instant.now();
    return RA.flow(
      userPreferencesResolverByUserId.resolve(userId),
      RA.map((previous) => UserPreferences.save({ userId, defaultPostVisibility }, previous, now)),
      RA.andThrough((event) => userPreferencesSavedStore.store(event)),
      RA.map((event) => event.aggregateState),
    );
  };

  return { run };
};

export const SaveUserPreferencesUseCase = { create } as const;
