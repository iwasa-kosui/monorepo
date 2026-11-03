import { describe, expect, it, vi } from 'vitest';

import type { PostImage } from '../../../domain/image/image.ts';
import type { IoriD1Db } from '../client.ts';
import { chunkImages, createD1PostImageCreatedStore } from './postImageCreatedStore.ts';

const createImages = (count: number): PostImage[] =>
  Array.from({ length: count }, (_, i) => ({
    imageId: `image-${i}`,
    postId: 'post-1',
    url: `https://remote.example/media/${i}.png`,
    altText: null,
    createdAt: 0,
  })) as unknown as PostImage[];

const createDb = () => {
  const values = vi.fn((rows: unknown[]) => ({ rows }));
  const db = {
    insert: vi.fn(() => ({ values })),
    batch: vi.fn(async (_statements: unknown[]) => []),
  };
  return { db, values, store: createD1PostImageCreatedStore(db as unknown as IoriD1Db) };
};

describe('chunkImages', () => {
  it('splits images into chunks of 20 rows', () => {
    expect(chunkImages(createImages(20)).map((chunk) => chunk.length)).toEqual([20]);
    expect(chunkImages(createImages(21)).map((chunk) => chunk.length)).toEqual([20, 1]);
    expect(chunkImages(createImages(45)).map((chunk) => chunk.length)).toEqual([20, 20, 5]);
    expect(chunkImages([])).toEqual([]);
  });
});

describe('createD1PostImageCreatedStore', () => {
  it('does nothing when there are no images', async () => {
    const { db, store } = createDb();

    await store.store([]);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('inserts 20 images in a single statement without batch', async () => {
    const { db, values, store } = createDb();

    await store.store(createImages(20));

    expect(values).toHaveBeenCalledOnce();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('splits 21 images into two statements and runs them in one batch', async () => {
    const { db, values, store } = createDb();

    await store.store(createImages(21));

    expect(values.mock.calls.map(([rows]) => rows.length)).toEqual([20, 1]);
    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.batch.mock.calls[0]?.[0]).toHaveLength(2);
  });
});
