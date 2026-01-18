import type { Activity, Actor, InboxContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import { ActorIdentity, type FromFedifyActorOptions, type ParseActorIdentityError } from './actorIdentity.ts';

export type InboxActorResolverError =
  | Readonly<{
    type: 'ActorNotFound';
    message: string;
  }>
  | ParseActorIdentityError;

export const InboxActorResolverError = {
  actorNotFound: (activityId?: string): InboxActorResolverError => ({
    type: 'ActorNotFound',
    message: activityId
      ? `Actor not found for activity: ${activityId}`
      : 'Actor not found for activity',
  }),
} as const;

export type InboxActorResolveResult = Readonly<{
  actor: Actor;
  actorIdentity: ActorIdentity;
  documentLoaderOptions: FromFedifyActorOptions;
}>;

export type InboxActorResolver = Readonly<{
  resolve: (
    ctx: InboxContext<unknown>,
    activity: Activity,
  ) => RA<InboxActorResolveResult, InboxActorResolverError>;
}>;

const createInstance = (): InboxActorResolver => {
  const resolve: InboxActorResolver['resolve'] = async (ctx, activity) => {
    // 個人inboxの場合はrecipientからidentifierを取得、共有inboxの場合はデフォルトのdocumentLoaderを使用
    const documentLoader = ctx.recipient
      ? await ctx.getDocumentLoader({ identifier: ctx.recipient })
      : ctx.documentLoader;
    const documentLoaderOptions: FromFedifyActorOptions = { documentLoader };

    const actor = await activity.getActor(documentLoaderOptions);
    if (!actor) {
      return RA.err(
        InboxActorResolverError.actorNotFound(activity.id?.href),
      );
    }

    const actorIdentityResult = await ActorIdentity.fromFedifyActor(
      actor,
      documentLoaderOptions,
    );
    if (!actorIdentityResult.ok) {
      return RA.err(actorIdentityResult.err);
    }

    return RA.ok({
      actor,
      actorIdentity: actorIdentityResult.val,
      documentLoaderOptions,
    });
  };

  return { resolve };
};

let instance: InboxActorResolver | undefined;

export const InboxActorResolver = {
  getInstance: (): InboxActorResolver => {
    if (!instance) {
      instance = createInstance();
    }
    return instance;
  },
} as const;
