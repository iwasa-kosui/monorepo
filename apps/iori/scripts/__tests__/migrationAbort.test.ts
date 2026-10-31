import { expect, it, vi } from 'vitest';
import { assertMigrationBucketPrivate, createMigrationR2Storage } from '../migration-r2-storage.mjs';
it('rejects already-aborted storage/privacy before SDK or network construction', async () => {
  const createClient = vi.fn(() => ({ send: async () => ({}) }));
  const fetchImpl = vi.fn(async () => new Response('{}'));
  const signal = AbortSignal.abort();
  expect(() =>
    createMigrationR2Storage({
      accountId: 'a'.repeat(32),
      bucket: 'private-bucket',
      accessKeyId: 'fixture',
      secretAccessKey: 'fixture',
      signal,
      createClient,
    })
  ).toThrow();
  await expect(
    assertMigrationBucketPrivate({
      accountId: 'a'.repeat(32),
      bucket: 'private-bucket',
      apiToken: 'fixture',
      signal,
      fetchImpl,
    }),
  ).rejects.toThrow();
  expect(createClient).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('propagates a global abort to the actual S3 request and awaits its settlement', async () => {
  const controller = new AbortController();
  let settled = false;
  const storage = createMigrationR2Storage({
    accountId: 'a'.repeat(32),
    bucket: 'private-bucket',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    signal: controller.signal,
    createClient: () => ({
      send: async (_command: unknown, options?: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options!.abortSignal.addEventListener('abort', () =>
            setTimeout(() => {
              settled = true;
              reject(new Error('aborted'));
            }, 10));
        }),
    }),
  });
  const pending = storage.putNew('fixture', Buffer.from('fixture'));
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(settled).toBe(true);
});
const storageWith = (send: () => Promise<unknown>) =>
  createMigrationR2Storage({
    accountId: 'a'.repeat(32),
    bucket: 'private-bucket',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    createClient: () => ({ send: send as never }),
  });
it('getIfExists returns null only for NoSuchKey or HTTP 404 and keeps get unchanged', async () => {
  const body = Buffer.from('present');
  expect(await storageWith(async () => ({ Body: body })).getIfExists('k', 100)).toEqual(body);
  for (
    const error of [
      Object.assign(new Error('x'), { name: 'NoSuchKey' }),
      Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } }),
    ]
  ) {
    const storage = storageWith(async () => {
      throw error;
    });
    expect(await storage.getIfExists('k', 100)).toBeNull();
    await expect(storage.get('k', 100)).rejects.toThrow('Migration storage read failed.');
  }
  for (
    const error of [
      new Error('network'),
      Object.assign(new Error('x'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }),
      Object.assign(new Error('x'), { $metadata: { httpStatusCode: 500 } }),
    ]
  ) {
    await expect(
      storageWith(async () => {
        throw error;
      }).getIfExists('k', 100),
    ).rejects.toThrow('Migration storage read failed.');
  }
  await expect(storageWith(async () => ({ Body: body })).getIfExists('k', 3)).rejects.toThrow(
    'Migration storage read failed.',
  );
});
