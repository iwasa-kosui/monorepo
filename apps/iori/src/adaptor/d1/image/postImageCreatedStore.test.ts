import { describe, expect, it } from 'vitest';

import type { PostImage } from '../../../domain/image/image.ts';
import { chunkImages } from './postImageCreatedStore.ts';

const createImages = (count: number): PostImage[] =>
  Array.from({ length: count }, (_, i) => ({
    imageId: `image-${i}`,
    postId: 'post-1',
    url: `https://remote.example/media/${i}.png`,
    altText: null,
    mediaType: null,
    createdAt: 0,
  })) as unknown as PostImage[];

describe('chunkImages', () => {
  it('splits images into chunks of 20 rows', () => {
    expect(chunkImages(createImages(20)).map((chunk) => chunk.length)).toEqual([20]);
    expect(chunkImages(createImages(21)).map((chunk) => chunk.length)).toEqual([20, 1]);
    expect(chunkImages(createImages(45)).map((chunk) => chunk.length)).toEqual([20, 20, 5]);
    expect(chunkImages([])).toEqual([]);
  });
});
