import type { R2Bucket, R2ObjectBody, R2PutOptions } from '@cloudflare/workers-types';

import type { ImageId } from '../../domain/image/imageId.ts';
import type {
  PostImageObjectBody,
  PostImageObjectStore,
  PutPostImageObjectInput,
} from '../../ports/postImageObjectStore.ts';

export type PostImageR2Bucket = Pick<R2Bucket, 'get' | 'put'>;

export type PostImageR2ObjectStoreConfig = Readonly<{
  bucket: PostImageR2Bucket;
  keyPrefix?: string;
  extension?: string;
  cacheControl?: string;
}>;

const defaultKeyPrefix = 'post-images';
const defaultExtension = 'original';
const defaultCacheControl = 'public, max-age=31536000, immutable';

const normalizeKeyPrefix = (keyPrefix: string): readonly string[] =>
  keyPrefix.split('/').filter((segment) => segment.length > 0);

export const postImageObjectKey = (
  imageId: ImageId,
  config: Pick<PostImageR2ObjectStoreConfig, 'extension' | 'keyPrefix'> = {},
): string =>
  [
    ...normalizeKeyPrefix(config.keyPrefix ?? defaultKeyPrefix),
    imageId,
    config.extension ?? defaultExtension,
  ].join('/');

const customMetadataFrom = (
  input: PutPostImageObjectInput,
): Record<string, string> => ({
  imageId: input.imageId,
  ...(input.contentLength === undefined
    ? {}
    : { contentLength: input.contentLength.toString() }),
});

const putOptionsFrom = (
  input: PutPostImageObjectInput,
  config: PostImageR2ObjectStoreConfig,
): R2PutOptions => ({
  httpMetadata: {
    contentType: input.contentType,
    cacheControl: config.cacheControl ?? defaultCacheControl,
  },
  customMetadata: customMetadataFrom(input),
});

const objectContentType = (object: R2ObjectBody): string =>
  object.httpMetadata?.contentType ?? 'application/octet-stream';

export const createPostImageR2ObjectStore = (
  config: PostImageR2ObjectStoreConfig,
): PostImageObjectStore => ({
  put: async (input) => {
    const key = postImageObjectKey(input.imageId, config);
    await config.bucket.put(key, input.body, putOptionsFrom(input, config));
    return {
      key,
      url: `/uploads/${input.imageId}.webp`,
    };
  },
  get: async (imageId) => {
    const key = postImageObjectKey(imageId, config);
    const object = await config.bucket.get(key);
    if (object === null) {
      return undefined;
    }
    return {
      key,
      body: object.body,
      contentType: objectContentType(object),
      cacheControl: object.httpMetadata?.cacheControl ?? defaultCacheControl,
    };
  },
});
