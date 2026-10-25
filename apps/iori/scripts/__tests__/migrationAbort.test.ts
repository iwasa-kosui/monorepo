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
