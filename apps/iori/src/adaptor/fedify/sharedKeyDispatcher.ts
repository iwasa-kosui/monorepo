import type { Context } from '@fedify/fedify';

import { singleton } from '../../helper/singleton.ts';

/**
 * The identifier for the instance actor.
 * Must be a valid Mastodon-compatible username (alphanumeric, underscore, dot, hyphen).
 * Tilde (~) is not allowed by Mastodon's USERNAME_RE validation.
 * Using "instance.actor" following the pattern used by Sharkey/Misskey forks.
 */
export const INSTANCE_ACTOR_IDENTIFIER = 'instance.actor';

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
