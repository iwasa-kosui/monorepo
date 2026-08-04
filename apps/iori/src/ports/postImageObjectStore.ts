import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';

import type { ImageId } from '../domain/image/imageId.ts';

export type PostImageObjectBody = Parameters<R2Bucket['put']>[1];

export type PutPostImageObjectInput = Readonly<{
  imageId: ImageId;
  body: PostImageObjectBody;
  contentType: string;
  contentLength?: number;
}>;

export type PostImageObject = Readonly<{
  key: string;
  body: R2ObjectBody['body'];
  contentType: string;
  cacheControl?: string;
}>;

export type PostImageObjectStore = Readonly<{
  put: (input: PutPostImageObjectInput) => Promise<{ key: string; url: string }>;
  get: (imageId: ImageId) => Promise<PostImageObject | undefined>;
}>;
