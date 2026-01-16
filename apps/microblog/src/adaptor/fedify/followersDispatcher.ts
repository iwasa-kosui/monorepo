import { type Context, type Recipient } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../domain/user/username.ts';
import { GetUserProfileUseCase } from '../../useCase/getUserProfile.ts';

const getInstance = () => {
  const useCase = GetUserProfileUseCase.getInstance();

  const dispatch = (ctx: Context<unknown>, identifier: string) =>
    RA.flow(
      RA.ok(Username.orThrow(identifier)),
      RA.andThen(async (username) => useCase.run({ username })),
      RA.match({
        ok: ({ followers }) => {
          getLogger().info(
            `Resolved followers for federation: ${identifier} - ${followers.length} followers`,
          );
          return {
            items: followers.map(
              (actor): Recipient => ({
                id: new URL(actor.uri),
                inboxId: new URL(actor.inboxUrl),
              }),
            ),
          };
        },
        err: (err) => {
          getLogger().warn(
            `Failed to resolve followers for federation: ${identifier} - ${err}`,
          );
          return {
            items: [],
          };
        },
      }),
    );
  return {
    dispatch,
  };
};

export const FollowersDispatcherCounter = {
  getInstance: () => {
  },
};

export const FollowersDispatcher = {
  getInstance,
} as const;
