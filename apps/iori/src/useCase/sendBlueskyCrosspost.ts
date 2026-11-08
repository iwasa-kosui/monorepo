import { RA, Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import {
  type BlueskyImageInput,
  type BlueskyLinkPreviewInput,
  buildBlueskyPostDraft,
  selectBlueskyImages,
  toBlueskyPostRecord,
} from '../adaptor/bluesky/blueskyPostRecord.ts';
import { parseUploadFilenameImageId } from '../adaptor/r2/postImageObjectStore.ts';
import {
  BlueskyCrosspost,
  type BlueskyCrosspostDeletedStore,
  type BlueskyCrosspostResolver,
  type BlueskyCrosspostSavedStore,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { PostImagesResolverByPostId } from '../domain/image/image.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { LinkPreviewsResolverByPostId } from '../domain/linkPreview/linkPreview.ts';
import type { LocalPostResolverByUri, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserResolver } from '../domain/user/user.ts';
import type { BlueskyClient, BlueskyThumbnailFetcher } from '../ports/blueskyClient.ts';
import type { PostImageObjectStore } from '../ports/postImageObjectStore.ts';
import { resolveBlueskyReplyContextWith } from './helper/blueskyReplyContext.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ postId: PostId }>;

export type SendBlueskyCrosspostOutcome = 'sent' | 'failed' | 'skipped' | 'gone' | 'noop';

export type SendBlueskyCrosspostUseCase = UseCase<Input, SendBlueskyCrosspostOutcome, never>;

type Deps = Readonly<{
  postResolver: PostResolver;
  userResolver: UserResolver;
  localPostResolverByUri: LocalPostResolverByUri;
  postImagesResolver: PostImagesResolverByPostId;
  linkPreviewsResolver: LinkPreviewsResolverByPostId;
  crosspostResolver: BlueskyCrosspostResolver;
  crosspostSavedStore: BlueskyCrosspostSavedStore;
  crosspostDeletedStore: BlueskyCrosspostDeletedStore;
  uploads: PostImageObjectStore;
  thumbnailFetcher: BlueskyThumbnailFetcher;
  client: BlueskyClient;
  origin: string;
  now: () => Instant;
}>;

const errorNameOf = (error: unknown): string => error instanceof Error ? error.name : typeof error;

const create = (deps: Deps): SendBlueskyCrosspostUseCase => {
  const resolveReplyContext = resolveBlueskyReplyContextWith(deps);

  const failWith = async (crosspost: BlueskyCrosspost, message: string): Promise<SendBlueskyCrosspostOutcome> => {
    await deps.crosspostSavedStore.save(BlueskyCrosspost.markFailed(crosspost, message, deps.now()));
    return 'failed';
  };

  const loadImage = async (
    image: Readonly<{ url: string; altText: string | null }>,
  ): Promise<BlueskyImageInput | undefined> => {
    try {
      const url = new URL(image.url, deps.origin);
      if (url.origin !== new URL(deps.origin).origin) return undefined;
      const imageId = parseUploadFilenameImageId(url.pathname.split('/').pop() ?? '');
      if (!imageId.ok) return undefined;
      const object = await deps.uploads.get(imageId.val);
      if (object === undefined) return undefined;
      const bytes = new Uint8Array(await new Response(object.body as unknown as BodyInit).arrayBuffer());
      return { bytes, mimeType: object.contentType, alt: image.altText };
    } catch {
      return undefined;
    }
  };

  const execute = async (postId: PostId): Promise<SendBlueskyCrosspostOutcome> => {
    const crosspost = Result.unsafeUnwrap(await deps.crosspostResolver.resolve(postId));
    if (crosspost === undefined || (crosspost.status !== 'pending' && crosspost.status !== 'failed')) return 'noop';

    const post = Result.unsafeUnwrap(await deps.postResolver.resolve(postId));
    if (post === undefined || post.type !== 'local') {
      await deps.crosspostDeletedStore.delete(postId);
      return 'gone';
    }

    const replyTo = await resolveReplyContext(post);
    const skipReason = BlueskyCrosspost.decideSkip({ summary: post.summary, sensitive: post.sensitive, replyTo });
    if (skipReason !== undefined) {
      await deps.crosspostSavedStore.save(BlueskyCrosspost.markSkipped(crosspost, skipReason, deps.now()));
      return 'skipped';
    }

    const user = Result.unsafeUnwrap(await deps.userResolver.resolve(post.userId));
    if (user === undefined) return failWith(crosspost, 'user not found');
    const postUrl = new URL(`/users/${user.username}/posts/${post.postId}`, deps.origin).href;

    const storedImages = [...Result.unsafeUnwrap(await deps.postImagesResolver.resolve(postId))]
      .sort((a, b) => a.createdAt - b.createdAt);
    const loaded = await Promise.all(storedImages.map(loadImage));
    const images = loaded.filter((image) => image !== undefined);

    const preview = Result.unsafeUnwrap(await deps.linkPreviewsResolver.resolve(postId))[0];
    let linkPreview: BlueskyLinkPreviewInput | undefined;
    if (preview !== undefined) {
      const needsThumb = selectBlueskyImages(images).kept.length === 0 && preview.imageUrl !== null;
      const thumb = needsThumb
        ? await deps.thumbnailFetcher.fetch(new URL(preview.imageUrl!, preview.url).href).catch(() => undefined)
        : undefined;
      linkPreview = {
        url: preview.url,
        title: preview.title,
        description: preview.description,
        ...(thumb === undefined ? {} : { thumb }),
      };
    }

    const draft = buildBlueskyPostDraft({
      html: post.content,
      summary: post.summary,
      sensitive: post.sensitive,
      postUrl,
      images,
      unavailableImageCount: storedImages.length - images.length,
      linkPreview,
      replyTo,
      createdAt: post.createdAt,
    });
    if (!draft.ok) {
      await deps.crosspostSavedStore.save(BlueskyCrosspost.markSkipped(crosspost, draft.err, deps.now()));
      return 'skipped';
    }

    const imageBlobs = [];
    for (const image of draft.val.images) {
      const uploaded = await deps.client.uploadBlob(image);
      if (!uploaded.ok) return failWith(crosspost, uploaded.err.message);
      imageBlobs.push(uploaded.val);
    }
    const thumbInput = draft.val.external?.thumb;
    const thumbUploaded = thumbInput === undefined ? undefined : await deps.client.uploadBlob(thumbInput);

    const created = await deps.client.createRecord(
      toBlueskyPostRecord(draft.val, {
        images: imageBlobs,
        ...(thumbUploaded?.ok ? { thumb: thumbUploaded.val } : {}),
      }),
    );
    if (!created.ok) return failWith(crosspost, created.err.message);

    const root = replyTo.kind === 'sent' ? replyTo.root : undefined;
    await deps.crosspostSavedStore.save(BlueskyCrosspost.markSent(crosspost, {
      ...created.val,
      rootUri: root?.uri ?? null,
      rootCid: root?.cid ?? null,
    }, deps.now()));
    return 'sent';
  };

  const run = async (input: Input) => {
    try {
      return RA.ok(await execute(input.postId));
    } catch (error) {
      getLogger().error(`Bluesky crosspost failed unexpectedly: ${input.postId}`, { errorName: errorNameOf(error) });
      await recordUnexpectedFailure(input.postId);
      return RA.ok<SendBlueskyCrosspostOutcome>('failed');
    }
  };

  const recordUnexpectedFailure = async (postId: PostId): Promise<void> => {
    try {
      const crosspost = Result.unsafeUnwrap(await deps.crosspostResolver.resolve(postId));
      if (crosspost !== undefined) await failWith(crosspost, 'unexpected error');
    } catch (error) {
      getLogger().error('Bluesky crosspost failure could not be recorded.', { errorName: errorNameOf(error) });
    }
  };

  return { run };
};

export const SendBlueskyCrosspostUseCase = { create } as const;
