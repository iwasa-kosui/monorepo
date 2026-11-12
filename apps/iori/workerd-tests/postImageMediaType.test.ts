import { env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1PostImageCreatedStore } from '../src/adaptor/d1/image/postImageCreatedStore.ts';
import { createD1PostImagesResolverByPostId } from '../src/adaptor/d1/image/postImagesResolver.ts';
import { createD1ThreadResolver } from '../src/adaptor/d1/post/threadResolver.ts';
import { ImageId } from '../src/domain/image/imageId.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { PostId } from '../src/domain/post/postId.ts';

const ORIGIN = 'https://iori.test';
const db = createD1Db(env.DB);

const actorId = crypto.randomUUID();
const postId = crypto.randomUUID();
const legacyImageId = crypto.randomUUID();

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
      actorId,
      'https://remote.example/users/post-image-media-type',
      'https://remote.example/users/post-image-media-type/inbox',
      'remote',
    ),
    env.DB.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').bind(
      actorId,
      'https://remote.example/@post-image-media-type',
      'post-image-media-type',
    ),
    env.DB.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)')
      .bind(postId, actorId, 'post', 1_000, 'remote'),
    env.DB.prepare('INSERT INTO remote_posts(postId,uri,inReplyToUri,visibility) VALUES (?,?,?,?)')
      .bind(postId, `https://remote.example/notes/${postId}`, null, 'public'),
    env.DB.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)')
      .bind(legacyImageId, postId, 'https://remote.example/media/legacy.png', null, 1_000),
  ]);
});

afterAll(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM post_images WHERE postId = ?').bind(postId),
    env.DB.prepare('DELETE FROM remote_posts WHERE postId = ?').bind(postId),
    env.DB.prepare('DELETE FROM posts WHERE postId = ?').bind(postId),
    env.DB.prepare('DELETE FROM remote_actors WHERE actorId = ?').bind(actorId),
    env.DB.prepare('DELETE FROM actors WHERE actorId = ?').bind(actorId),
  ]);
});

describe('post_images.mediaType on workerd D1', () => {
  it('migration 前からある行は mediaType が null になる', async () => {
    const images = await createD1PostImagesResolverByPostId(db).resolve(PostId.orThrow(postId));

    expect(images.ok).toBe(true);
    if (!images.ok) return;
    expect(images.val).toEqual([expect.objectContaining({ imageId: legacyImageId, mediaType: null })]);
  });

  it('mediaType を保存して、画像の resolver と投稿の resolver の両方で読める', async () => {
    const videoId = ImageId.generate();
    await createD1PostImageCreatedStore(db).store([{
      imageId: videoId,
      postId: PostId.orThrow(postId),
      url: 'https://remote.example/media/1.mp4',
      altText: '動画の説明',
      mediaType: 'video/mp4',
      createdAt: Instant.now(),
    }]);

    const images = await createD1PostImagesResolverByPostId(db).resolve(PostId.orThrow(postId));
    const thread = await createD1ThreadResolver(db, ORIGIN).resolve({ postId: PostId.orThrow(postId) });

    expect(images.ok).toBe(true);
    expect(thread.ok).toBe(true);
    if (!images.ok || !thread.ok) return;
    expect(images.val.find((image) => image.imageId === videoId)).toMatchObject({
      url: 'https://remote.example/media/1.mp4',
      mediaType: 'video/mp4',
    });
    expect(thread.val.currentPost?.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ imageId: legacyImageId, mediaType: null }),
        expect.objectContaining({ imageId: videoId, mediaType: 'video/mp4' }),
      ]),
    );
  });
});
