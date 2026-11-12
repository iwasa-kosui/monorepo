import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { type CreateStatusParams, failureMessage } from '../api/mastodonClient.ts';

export type UploadedMedia = Readonly<{ id: string; url: string; description: string }>;

export type PostFormValue = Readonly<{
  content: string;
  uploaded: readonly UploadedMedia[];
  destination: PostDestination;
  cw: string;
  sensitive: boolean;
}>;

export type PostSubmitResult =
  | Readonly<{ kind: 'posted'; status: Status }>
  | Readonly<{ kind: 'failed'; message: string }>;

type SubmitPostDeps = Readonly<{
  create: (params: CreateStatusParams) => Promise<Status>;
  updateMedia: (id: string, description: string) => Promise<unknown>;
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
      if (media.description.trim() !== '') await deps.updateMedia(media.id, media.description);
    }
  } catch (err) {
    return { kind: 'failed', message: failureMessage('save the image description', err) };
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
