import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { ClientId, OAuthApplicationId } from './ids.ts';
import type { ParseResult } from './oauthError.ts';
import { RedirectUri } from './redirectUri.ts';
import { Scope } from './scope.ts';
import { SecretHash } from './secret.ts';

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const zodType = z.object({
  id: OAuthApplicationId.zodType,
  clientId: ClientId.zodType,
  clientSecretHash: SecretHash.zodType,
  name: z.string().trim().min(1).max(200),
  website: z.nullable(z.string().max(2000).refine(isHttpUrl, 'website must be an http or https URL')),
  redirectUris: z.array(RedirectUri.zodType).min(1).max(RedirectUri.maxCount),
  scopes: z.array(Scope.zodType).min(1),
  createdAt: Instant.zodType,
}).describe('OAuthApplication');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type OAuthApplication = z.output<typeof zodType>;
export type OAuthApplicationAggregate = Agg.Aggregate<OAuthApplicationId, 'oauthApplication', OAuthApplication>;
export type OAuthApplicationEvent<
  TAggregateState extends Agg.InferState<OAuthApplicationAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<OAuthApplicationAggregate, TAggregateState, TEventName, TEventPayload>;

export const OAuthApplicationEvent = AggregateEvent.createFactory<OAuthApplicationAggregate>('oauthApplication');

export type OAuthApplicationRegistered = OAuthApplicationEvent<
  OAuthApplication,
  'oauthApplication.registered',
  OAuthApplication
>;
export type OAuthApplicationRegisteredStore = Agg.Store<OAuthApplicationRegistered>;
export type OAuthApplicationResolver = Agg.Resolver<OAuthApplicationId, OAuthApplication | undefined>;
export type OAuthApplicationResolverByClientId = Agg.Resolver<ClientId, OAuthApplication | undefined>;

const register = (now: Instant) =>
(
  input: Omit<z.input<typeof zodType>, 'id' | 'createdAt'>,
): ParseResult<OAuthApplicationRegistered> =>
  Result.flow(
    schema.of({ ...input, id: OAuthApplicationId.generate(), createdAt: now }),
    Result.map((application: OAuthApplication): OAuthApplicationRegistered =>
      OAuthApplicationEvent.create(
        application.id,
        application,
        'oauthApplication.registered',
        application,
        now,
      )
    ),
  );

export const OAuthApplication = {
  ...schema,
  register,
} as const;
