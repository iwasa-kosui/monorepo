import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyPostResponse } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { type CreateBlueskyPostParams, type CreateStatusParams, failureMessage } from '../api/mastodonClient.ts';
import { BLUESKY_ONLY_POSTED_MESSAGE, postedMessage } from './blueskyCrosspostMark.ts';

export type UploadedMedia = Readonly<{ id: string; url: string }>;

export type PostFormValue = Readonly<{
  content: string;
  uploaded: readonly UploadedMedia[];
  destination: PostDestination;
}>;

export type PostSubmitResult =
  | Readonly<{ kind: 'posted'; status: Status }>
  | Readonly<{ kind: 'postedToBluesky'; url: string | null }>
  | Readonly<{ kind: 'failed'; message: string }>;

export type PostNotice = Readonly<{ message: string; href: string | null }>;

type SubmitPostDeps = Readonly<{
  create: (params: CreateStatusParams) => Promise<Status>;
  createBlueskyPost: (params: CreateBlueskyPostParams) => Promise<IoriBlueskyPostResponse>;
  onPosted: (status: Status) => void;
}>;

export const canSubmitPost = (content: string, isUploading: boolean, isPosting: boolean): boolean =>
  content.trim() !== '' && !isUploading && !isPosting;

export const submitPost = async (
  value: PostFormValue,
  deps: SubmitPostDeps,
): Promise<PostSubmitResult> => {
  if (value.destination === 'bluesky') {
    try {
      const { url } = await deps.createBlueskyPost({
        status: value.content,
        media_ids: value.uploaded.map((media) => media.id),
        content_type: 'text/markdown',
      });
      return { kind: 'postedToBluesky', url };
    } catch (err) {
      return { kind: 'failed', message: failureMessage('post', err) };
    }
  }
  let status: Status;
  try {
    status = await deps.create({
      status: value.content,
      media_ids: value.uploaded.map((media) => media.id),
      content_type: 'text/markdown',
      iori_destination: value.destination,
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
