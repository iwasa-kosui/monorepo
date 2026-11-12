import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { OgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { extractUrlsFromHtml } from '../adaptor/ogp/urlExtractor.ts';
import type { ActorResolverByUri } from '../domain/actor/actor.ts';
import type { PostImage, PostImagesResolverByPostId } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type {
  LinkPreview,
  LinkPreviewCreatedStore,
  LinkPreviewsDeletedStore,
  LinkPreviewsResolverByPostId,
} from '../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../domain/linkPreview/linkPreviewId.ts';
import {
  Post,
  type PostResolverByUri,
  type RemotePost,
  type RemotePostAttachment,
  type RemotePostRecipientsResolverByPostId,
  type RemotePostUpdatedStore,
} from '../domain/post/post.ts';
import type { Visibility } from '../domain/post/visibility.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  uri: string;
  actorUri: string;
  content: string;
  summary: string | null;
  sensitive: boolean;
  attachments: ReadonlyArray<RemotePostAttachment>;
  recipientActorUris: ReadonlyArray<string>;
  visibility: Visibility | null;
  editedAt: Instant;
}>;

type Ok = Readonly<
  | { type: 'updated'; post: RemotePost }
  | { type: 'postNotFound' }
  | { type: 'staleEdit' }
>;

export type RemotePostUpdateAuthorMismatchError = Readonly<{
  type: 'RemotePostUpdateAuthorMismatchError';
  message: string;
  detail: {
    uri: string;
    actorUri: string;
  };
}>;

export const RemotePostUpdateAuthorMismatchError = {
  create: (detail: { uri: string; actorUri: string }): RemotePostUpdateAuthorMismatchError => ({
    type: 'RemotePostUpdateAuthorMismatchError',
    message: `The post with URI "${detail.uri}" is not authored by actor "${detail.actorUri}".`,
    detail,
  }),
} as const;

type Err = RemotePostUpdateAuthorMismatchError;

export type UpdateRemotePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  postResolverByUri: PostResolverByUri;
  actorResolverByUri: ActorResolverByUri;
  remotePostRecipientsResolver: RemotePostRecipientsResolverByPostId;
  postImagesResolver: PostImagesResolverByPostId;
  remotePostUpdatedStore: RemotePostUpdatedStore;
  linkPreviewsResolver: LinkPreviewsResolverByPostId;
  linkPreviewCreatedStore: LinkPreviewCreatedStore;
  linkPreviewsDeletedStore: LinkPreviewsDeletedStore;
  ogpFetcher: OgpFetcher;
}>;

const create = ({
  origin,
  postResolverByUri,
  actorResolverByUri,
  remotePostRecipientsResolver,
  postImagesResolver,
  remotePostUpdatedStore,
  linkPreviewsResolver,
  linkPreviewCreatedStore,
  linkPreviewsDeletedStore,
  ogpFetcher,
}: Deps): UpdateRemotePostUseCase => {
  const refreshLinkPreviews = async (post: RemotePost, content: string, now: Instant) => {
    const urls = extractUrlsFromHtml(content, new URL(origin).host);
    const existing = await linkPreviewsResolver.resolve(post.postId);
    if (!existing.ok) return;
    const kept = new Set(existing.val.filter((preview) => urls.includes(preview.url)).map((preview) => preview.url));
    const removedIds = existing.val.filter((preview) => !urls.includes(preview.url)).map((preview) =>
      preview.linkPreviewId
    );
    if (removedIds.length > 0) {
      await linkPreviewsDeletedStore.store(removedIds);
    }
    const addedUrls = urls.filter((url) => !kept.has(url));
    const ogpResults = await Promise.allSettled(addedUrls.map((url) => ogpFetcher.fetch(url)));
    const added: LinkPreview[] = [];
    ogpResults.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const ogp = result.value;
      if (ogp.title ?? ogp.description) {
        added.push({
          linkPreviewId: LinkPreviewId.generate(),
          postId: post.postId,
          url: addedUrls[i],
          title: ogp.title,
          description: ogp.description,
          imageUrl: ogp.imageUrl,
          faviconUrl: ogp.faviconUrl,
          siteName: ogp.siteName,
          createdAt: now,
        });
      }
    });
    if (added.length > 0) {
      await linkPreviewCreatedStore.store(added);
    }
  };

  const run = async (input: Input) => {
    const now = Instant.now();
    const existing = await postResolverByUri.resolve({ uri: input.uri });
    if (!existing.ok) throw new Error(`Failed to resolve the remote post for ${input.uri}`);
    const post = existing.val;
    if (!post) return RA.ok<Ok>({ type: 'postNotFound' });

    const authorResult = await actorResolverByUri.resolve(input.actorUri);
    if (!authorResult.ok) throw new Error(`Failed to resolve the actor ${input.actorUri}`);
    if (authorResult.val?.id !== post.actorId) {
      return RA.err(RemotePostUpdateAuthorMismatchError.create({ uri: input.uri, actorUri: input.actorUri }));
    }

    if (!Post.isNewerEdit(post, input.editedAt)) return RA.ok<Ok>({ type: 'staleEdit' });

    const previousRecipients = await remotePostRecipientsResolver.resolve(post.postId);
    if (!previousRecipients.ok) throw new Error(`Failed to resolve the recipients of ${input.uri}`);

    const existingImages = await postImagesResolver.resolve(post.postId);
    if (!existingImages.ok) throw new Error(`Failed to resolve the images of ${input.uri}`);
    const reusable = new Map(existingImages.val.map((image) => [image.url, image]));
    const images: PostImage[] = input.attachments.map((attachment) => {
      const previous = reusable.get(attachment.url);
      reusable.delete(attachment.url);
      return {
        imageId: previous?.imageId ?? ImageId.generate(),
        postId: post.postId,
        url: attachment.url,
        altText: attachment.altText,
        mediaType: attachment.mediaType,
        createdAt: previous?.createdAt ?? now,
      };
    });

    const event = Post.updateRemotePost(now)(post, {
      content: input.content,
      summary: input.summary,
      sensitive: input.sensitive,
      editedAt: input.editedAt,
      visibility: input.visibility,
      recipientActorUris: input.recipientActorUris,
      previousRecipientActorUris: previousRecipients.val,
      images,
    });
    await remotePostUpdatedStore.store(event);

    try {
      await refreshLinkPreviews(post, input.content, now);
    } catch (error) {
      getLogger().warn(`Failed to refresh link previews for edited remote post ${input.uri}: ${String(error)}`);
    }

    return RA.ok<Ok>({ type: 'updated', post: event.aggregateState });
  };

  return { run };
};

export const UpdateRemotePostUseCase = {
  create,
} as const;
