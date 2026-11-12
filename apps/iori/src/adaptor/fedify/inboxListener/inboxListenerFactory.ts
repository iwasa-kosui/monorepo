import { createOnAccept, type OnAcceptDeps } from './onAccept.ts';
import { createOnActivity, type OnActivityDeps } from './onActivity.ts';
import { createOnAnnounce, type OnAnnounceDeps } from './onAnnounce.ts';
import { createOnBlock, type OnBlockDeps } from './onBlock.ts';
import { createOnCreate, type OnCreateDeps } from './onCreate.ts';
import { createOnDelete, type OnDeleteDeps } from './onDelete.ts';
import { createOnFollow, type OnFollowDeps } from './onFollow.ts';
import { createOnLike, type OnLikeDeps } from './onLike.ts';
import { createOnReject, type OnRejectDeps } from './onReject.ts';
import { createOnUndo, type OnUndoDeps } from './onUndo.ts';
import { createOnUpdate, type OnUpdateDeps } from './onUpdate.ts';

export type InboxListenerDeps = Readonly<{
  onAccept: OnAcceptDeps;
  onActivity: OnActivityDeps;
  onAnnounce: OnAnnounceDeps;
  onBlock: OnBlockDeps;
  onCreate: OnCreateDeps;
  onDelete: OnDeleteDeps;
  onFollow: OnFollowDeps;
  onLike: OnLikeDeps;
  onReject: OnRejectDeps;
  onUndo: OnUndoDeps;
  onUpdate: OnUpdateDeps;
}>;

export const createInboxListener = (deps: InboxListenerDeps) => ({
  onAccept: createOnAccept(deps.onAccept),
  onActivity: createOnActivity(deps.onActivity),
  onAnnounce: createOnAnnounce(deps.onAnnounce),
  onBlock: createOnBlock(deps.onBlock),
  onCreate: createOnCreate(deps.onCreate),
  onDelete: createOnDelete(deps.onDelete),
  onFollow: createOnFollow(deps.onFollow),
  onLike: createOnLike(deps.onLike),
  onReject: createOnReject(deps.onReject),
  onUndo: createOnUndo(deps.onUndo),
  onUpdate: createOnUpdate(deps.onUpdate),
});
