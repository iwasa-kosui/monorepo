import { createOnAccept, type OnAcceptDeps } from './onAccept.ts';
import { createOnActivity, type OnActivityDeps } from './onActivity.ts';
import { createOnAnnounce, type OnAnnounceDeps } from './onAnnounce.ts';
import { createOnCreate, type OnCreateDeps } from './onCreate.ts';
import { createOnDelete, type OnDeleteDeps } from './onDelete.ts';
import { createOnFollow, type OnFollowDeps } from './onFollow.ts';
import { createOnLike, type OnLikeDeps } from './onLike.ts';
import { createOnUndo, type OnUndoDeps } from './onUndo.ts';

export type InboxListenerDeps = Readonly<{
  onAccept: OnAcceptDeps;
  onActivity: OnActivityDeps;
  onAnnounce: OnAnnounceDeps;
  onCreate: OnCreateDeps;
  onDelete: OnDeleteDeps;
  onFollow: OnFollowDeps;
  onLike: OnLikeDeps;
  onUndo: OnUndoDeps;
}>;

export const createInboxListener = (deps: InboxListenerDeps) => ({
  onAccept: createOnAccept(deps.onAccept),
  onActivity: createOnActivity(deps.onActivity),
  onAnnounce: createOnAnnounce(deps.onAnnounce),
  onCreate: createOnCreate(deps.onCreate),
  onDelete: createOnDelete(deps.onDelete),
  onFollow: createOnFollow(deps.onFollow),
  onLike: createOnLike(deps.onLike),
  onUndo: createOnUndo(deps.onUndo),
});
