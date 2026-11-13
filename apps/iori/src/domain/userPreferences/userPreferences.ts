import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import type { Visibility } from '../post/visibility.ts';
import { UserId } from '../user/userId.ts';

const defaultPostVisibilityValues = ['public', 'unlisted', 'private'] as const satisfies ReadonlyArray<
  Exclude<Visibility, 'direct'>
>;
const defaultPostVisibilityZodType = z.enum(defaultPostVisibilityValues).describe('DefaultPostVisibility');
const defaultPostVisibilitySchema = Schema.create<
  z.output<typeof defaultPostVisibilityZodType>,
  z.input<typeof defaultPostVisibilityZodType>
>(defaultPostVisibilityZodType);
export type DefaultPostVisibility = z.output<typeof defaultPostVisibilityZodType>;
export const DefaultPostVisibility = {
  ...defaultPostVisibilitySchema,
  values: defaultPostVisibilityValues,
  fallback: 'public' satisfies DefaultPostVisibility,
} as const;

const zodType = z
  .object({
    userId: UserId.zodType,
    defaultPostVisibility: defaultPostVisibilityZodType,
    createdAt: Instant.zodType,
    updatedAt: Instant.zodType,
  })
  .describe('UserPreferences');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type UserPreferences = z.output<typeof zodType>;

export type UserPreferencesAggregateId = Readonly<{
  userId: UserId;
}>;
export type UserPreferencesAggregate = Agg.Aggregate<
  UserPreferencesAggregateId,
  'userPreferences',
  UserPreferences
>;
const toAggregateId = (preferences: UserPreferences): UserPreferencesAggregateId => ({
  userId: preferences.userId,
});

type UserPreferencesEvent<
  TAggregateState extends Agg.InferState<UserPreferencesAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<UserPreferencesAggregate, TAggregateState, TEventName, TEventPayload>;
const UserPreferencesEvent = AggregateEvent.createFactory<UserPreferencesAggregate>('userPreferences');

export type UserPreferencesSaved = UserPreferencesEvent<
  UserPreferences,
  'userPreferences.saved',
  UserPreferences
>;

const save = (
  input: Readonly<{ userId: UserId; defaultPostVisibility: DefaultPostVisibility }>,
  previous: UserPreferences | undefined,
  now: Instant,
): UserPreferencesSaved => {
  const preferences = schema.orThrow({
    ...input,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  });
  return UserPreferencesEvent.create(
    toAggregateId(preferences),
    preferences,
    'userPreferences.saved',
    preferences,
    now,
  );
};

export type UserPreferencesSavedStore = Agg.Store<UserPreferencesSaved>;
export type UserPreferencesResolverByUserId = Agg.Resolver<UserId, UserPreferences | undefined>;

export const UserPreferences = {
  ...schema,
  save,
  toAggregateId,
} as const;
