import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyPostResponse } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import {
  blueskyFailureMessage,
  type CreateBlueskyPostParams,
  type CreateStatusParams,
  failureMessage,
  type UpdateStatusParams,
} from '../api/mastodonClient.ts';
import { BLUESKY_ONLY_POSTED_MESSAGE, postedMessage } from './blueskyCrosspostMark.ts';
import { BLUESKY_ONLY_VISIBILITY_ERROR, type PostVisibility } from './postVisibility.ts';

export type UploadedMedia = Readonly<{ id: string; url: string; description: string; savedDescription: string }>;

export type PostFormValue = Readonly<{
  content: string;
  uploaded: readonly UploadedMedia[];
  destination: PostDestination;
  visibility: PostVisibility;
  cw: string;
  sensitive: boolean;
}>;

export type PostSubmitResult =
  | Readonly<{ kind: 'posted'; status: Status }>
  | Readonly<{ kind: 'postedToBluesky'; url: string | null }>
  | Readonly<{ kind: 'failed'; message: string }>;

export type PostNotice = Readonly<{ message: string; href: string | null }>;

type SubmitPostDeps = Readonly<{
  create: (params: CreateStatusParams) => Promise<Status>;
  createBlueskyPost: (params: CreateBlueskyPostParams) => Promise<IoriBlueskyPostResponse>;
  updateMedia: (id: string, description: string) => Promise<unknown>;
  onDescriptionSaved: (id: string, description: string) => void;
  onPosted: (status: Status) => void;
}>;

export const canSubmitPost = (content: string, isUploading: boolean, isPosting: boolean): boolean =>
  content.trim() !== '' && !isUploading && !isPosting;

export const mediaSlotsLeft = (count: number, max: number): number => Math.max(0, max - count);

export const saveMediaDescriptions = async (
  uploaded: readonly UploadedMedia[],
  deps: Readonly<{
    updateMedia: (id: string, description: string) => Promise<unknown>;
    onDescriptionSaved: (id: string, description: string) => void;
  }>,
): Promise<void> => {
  for (const media of uploaded) {
    const description = media.description.trim() === '' ? '' : media.description;
    if (description === media.savedDescription) continue;
    await deps.updateMedia(media.id, description);
    deps.onDescriptionSaved(media.id, description);
  }
};

export const submitPost = async (
  value: PostFormValue,
  deps: SubmitPostDeps,
): Promise<PostSubmitResult> => {
  try {
    await saveMediaDescriptions(value.uploaded, deps);
  } catch (err) {
    return { kind: 'failed', message: failureMessage('save the image description', err) };
  }
  if (value.destination === 'bluesky') {
    if (value.visibility !== 'public') return { kind: 'failed', message: BLUESKY_ONLY_VISIBILITY_ERROR };
    try {
      const { url } = await deps.createBlueskyPost({
        status: value.content,
        media_ids: value.uploaded.map((media) => media.id),
        content_type: 'text/markdown',
      });
      return { kind: 'postedToBluesky', url };
    } catch (err) {
      return { kind: 'failed', message: blueskyFailureMessage('post', err) };
    }
  }
  const spoilerText = value.cw.trim();
  let status: Status;
  try {
    status = await deps.create({
      status: value.content,
      media_ids: value.uploaded.map((media) => media.id),
      content_type: 'text/markdown',
      iori_destination: value.destination,
      visibility: value.visibility,
      ...(spoilerText === '' ? {} : { spoiler_text: spoilerText }),
      ...(value.sensitive ? { sensitive: true } : {}),
    });
  } catch (err) {
    return { kind: 'failed', message: failureMessage('post', err) };
  }
  deps.onPosted(status);
  return { kind: 'posted', status };
};

export const postedNotice = (
  destination: PostDestination,
  result: Exclude<PostSubmitResult, Readonly<{ kind: 'failed' }>>,
): PostNotice =>
  result.kind === 'postedToBluesky'
    ? { message: BLUESKY_ONLY_POSTED_MESSAGE, href: result.url }
    : {
      message: postedMessage(destination, result.status.iori?.bluesky_crosspost, result.status.visibility),
      href: null,
    };

export const replyParams = (
  postId: string,
  content: string,
  destination: PostDestination,
  visibility?: PostVisibility,
): CreateStatusParams => ({
  status: content,
  in_reply_to_id: postId,
  content_type: 'text/markdown',
  iori_destination: destination,
  ...(visibility === undefined ? {} : { visibility }),
});

export const editParams = (
  value: Readonly<{ content: string; cw: string; sensitive: boolean }>,
  hasImages: boolean,
): UpdateStatusParams => ({
  status: value.content,
  spoiler_text: value.cw.trim(),
  sensitive: hasImages && value.sensitive,
  content_type: 'text/markdown',
});

export const quoteParams = (
  postId: string,
  content: string,
  destination: PostDestination,
): CreateStatusParams => ({
  status: content,
  quoted_status_id: postId,
  content_type: 'text/markdown',
  iori_destination: destination,
});
