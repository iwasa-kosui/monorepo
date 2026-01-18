import type { Context } from '@fedify/fedify';

import { singleton } from '../../helper/singleton.ts';

/**
 * The identifier for the instance actor.
 * The leading tilde is used to avoid conflicts with regular actor handles.
 */
export const INSTANCE_ACTOR_IDENTIFIER = '~actor';

/**
 * SharedKeyDispatcher selects which actor's key pair to use for
 * authenticating outgoing requests from the shared inbox.
 *
 * Uses the instance actor pattern where a dedicated Application actor
 * represents the server itself for authenticated requests.
 */
const getInstance = singleton(() => {
  const dispatch = (
    _ctx: Context<unknown>,
  ): { identifier: string } => {
    return { identifier: INSTANCE_ACTOR_IDENTIFIER };
  };

  return { dispatch };
});

export const SharedKeyDispatcher = {
  getInstance,
} as const;
