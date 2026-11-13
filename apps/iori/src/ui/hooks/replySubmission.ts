import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { PostVisibility } from '../components/postVisibility.ts';

export type SendReplyOptions = Readonly<{
  destination: PostDestination;
  visibility?: PostVisibility;
  parentVisibility?: Visibility;
}>;

type SharedReplyState = Readonly<{
  replyDestination: PostDestination;
  replyVisibility: PostVisibility;
  replyParentVisibility: Visibility | undefined;
}>;

export type ReplySubmission = Readonly<{
  destination: PostDestination;
  visibility: PostVisibility | undefined;
  parentVisibility: Visibility | undefined;
  resetsSharedDraft: boolean;
}>;

export const resolveReplySubmission = (
  shared: SharedReplyState,
  options?: SendReplyOptions,
): ReplySubmission => {
  if (options) {
    return {
      destination: options.destination,
      visibility: options.visibility,
      parentVisibility: options.parentVisibility,
      // スレッドのフォームは本文と送り先を自分で持つため、返信のモーダルの下書きを消さない
      resetsSharedDraft: false,
    };
  }
  return {
    destination: shared.replyDestination,
    visibility: shared.replyVisibility,
    parentVisibility: shared.replyParentVisibility,
    resetsSharedDraft: true,
  };
};
