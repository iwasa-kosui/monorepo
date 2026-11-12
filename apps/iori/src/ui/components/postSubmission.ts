import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyPostResponse } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import {
  blueskyFailureMessage,
  type CreateBlueskyPostParams,
  type CreateStatusParams,
  failureMessage,
} from '../api/mastodonClient.ts';
import { BLUESKY_ONLY_POSTED_MESSAGE, postedMessage } from './blueskyCrosspostMark.ts';

export type UploadedMedia = Readonly<{ id: string; url: string; description: string; savedDescription: string }>;

export type PostFormValue = Readonly<{
  content: string;
  uploaded: readonly UploadedMedia[];
  destination: PostDestination;
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

export const submitPost = async (
  value: PostFormValue,
  deps: SubmitPostDeps,
): Promise<PostSubmitResult> => {
  try {
    for (const media of value.uploaded) {
      const description = media.description.trim() === '' ? '' : media.description;
      if (description === media.savedDescription) continue;
      await deps.updateMedia(media.id, description);
      deps.onDescriptionSaved(media.id, description);
    }
  } catch (err) {
    return { kind: 'failed', message: failureMessage('save the image description', err) };
  }
  if (value.destination === 'bluesky') {
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
    : { message: postedMessage(destination, result.status.iori?.bluesky_crosspost), href: null };

export const replyParams = (
  postId: string,
  content: string,
  destination: PostDestination,
): CreateStatusParams => ({
  status: content,
  in_reply_to_id: postId,
  content_type: 'text/markdown',
  iori_destination: destination,
});
