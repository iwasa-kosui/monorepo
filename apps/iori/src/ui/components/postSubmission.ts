import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { type CreateStatusParams, failureMessage } from '../api/mastodonClient.ts';
import type { PostVisibility } from './postVisibility.ts';

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
  | Readonly<{ kind: 'failed'; message: string }>;

type SubmitPostDeps = Readonly<{
  create: (params: CreateStatusParams) => Promise<Status>;
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
