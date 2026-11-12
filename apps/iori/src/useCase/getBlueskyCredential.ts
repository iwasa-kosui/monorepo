import { RA } from '@iwasa-kosui/result';

import type { BlueskyCredentialView } from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySessionResolver } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { ResolveBlueskyCredentialUseCase } from './resolveBlueskyCredential.ts';
import type { UseCase } from './useCase.ts';

export type GetBlueskyCredentialUseCase = UseCase<void, BlueskyCredentialView, never>;

type Deps = Readonly<{
  resolveCredential: ResolveBlueskyCredentialUseCase;
  sessionResolver: BlueskySessionResolver;
  registrable: boolean;
}>;

const create = ({ resolveCredential, sessionResolver, registrable }: Deps): GetBlueskyCredentialUseCase => {
  const run = async (): RA<BlueskyCredentialView, never> => {
    const resolution = await resolveCredential.run();
    if (resolution.source === 'settings') {
      return RA.ok({
        source: 'settings',
        handle: resolution.stored.handle,
        did: resolution.stored.did,
        chatPermitted: resolution.stored.chatPermitted,
        verifiedAt: resolution.stored.verifiedAt,
        registrable,
      });
    }
    if (resolution.source === 'secret') {
      const session = await sessionResolver.resolve();
      return RA.ok({
        source: 'secret',
        handle: session.ok ? session.val?.handle ?? null : null,
        did: session.ok ? session.val?.did ?? null : null,
        chatPermitted: null,
        verifiedAt: null,
        registrable,
      });
    }
    return RA.ok({ source: 'none', handle: null, did: null, chatPermitted: null, verifiedAt: null, registrable });
  };

  return { run };
};

export const GetBlueskyCredentialUseCase = { create } as const;
