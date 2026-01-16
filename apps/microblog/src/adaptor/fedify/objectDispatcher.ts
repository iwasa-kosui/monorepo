import { Document, Note, PUBLIC_COLLECTION, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { getLogger } from '@logtape/logtape';

import { getMimeTypeFromUrl } from '../../domain/image/mimeType.ts';
import { PostId } from '../../domain/post/postId.ts';
import { Env } from '../../env.ts';
import { GetPostUseCase } from '../../useCase/getPost.ts';
import { PgPostImagesResolverByPostId } from '../pg/image/postImagesResolver.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';

const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) => {
  const useCase = GetPostUseCase.create({
    postResolver: PgPostResolver.getInstance(),
    postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
  });
  return RA.flow(
    RA.ok({
      postId: PostId.orThrow(values.id),
    }),
    RA.andThen(async (input) => useCase.run(input)),
    RA.match({
      ok: ({ post, postImages }) => {
        return new Note({
          id: ctx.getObjectUri(Note, values),
          attribution: ctx.getActorUri(values.identifier),
          to: PUBLIC_COLLECTION,
          cc: ctx.getFollowersUri(values.identifier),
          content: post.content,
          mediaType: 'text/html',
          published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
          url: ctx.getObjectUri(Note, values),
          attachments: postImages.map((image) =>
            new Document({
              url: new URL(`${Env.getInstance().ORIGIN}${image.url}`),
              mediaType: getMimeTypeFromUrl(image.url),
            })
          ),
        });
      },
      err: (err) => {
        getLogger().warn(
          `Failed to resolve post for federation: ${values.identifier} - ${values.id} - ${err}`,
        );
        return null;
      },
    }),
  );
};

export const ObjectDispatcher = {
  ofNote,
} as const;
