import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { runExecutorCli } from '../execute-protected-migration.mjs';
import { preparationFixture, targetOutputsFixture } from './migrationTargetFixture.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const { target } = targetOutputsFixture();
const mocks = vi.hoisted(() => ({ readSealed: vi.fn() }));
vi.mock('../read-sealed-migration-target.mjs', () => ({ readSealedMigrationTarget: mocks.readSealed }));
vi.mock('../migration-target-input.mjs', () => ({ loadExpectedTarget: async () => target }));
vi.mock('../migration-path-safety.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  assertExternalMigrationRoot: async () => {},
}));
vi.mock('../run-protected-migration.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  loadReceiptPublicKey: async () => publicKey,
}));
vi.mock('../migration-file-stream.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  readPrivateBounded: async (path: string) =>
    path === '/rehearsal.json' ? '{}' : privateKey.export({ type: 'pkcs8', format: 'pem' }),
}));
vi.mock('../migration-budget.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  parseMigrationRehearsal: () => ({}),
}));
vi.mock('../source-control-ssh.mjs', () => ({ createSourceSshAdapter: async () => ({}) }));
vi.mock('../migration-target-setup.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  transferStorageFromEnvironment: () => ({}),
}));
vi.mock('../migration-r2-writer.mjs', () => ({ createMigrationR2Writer: () => ({}) }));
vi.mock('../cloudflare-import-provider.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  createCloudflareImportTransport: () => ({}),
}));
vi.mock('../verify-cloudflare-import.mjs', async (importOriginal) => ({
  ...await importOriginal<object>(),
  createCloudflareImportProvider: () => ({}),
}));

const zoneId = 'c'.repeat(32);
beforeEach(() => {
  mocks.readSealed.mockReset();
  mocks.readSealed.mockResolvedValue({});
  vi.stubEnv('MAIN_SHA', target.identity.main_sha);
  vi.stubEnv('IORI_MIGRATION_RUN_ID', target.identity.run_id);
  vi.stubEnv('IORI_MIGRATION_EXPECTED_TARGET_PATH', '/target.json');
  vi.stubEnv('IORI_MIGRATION_ROOT', '/root');
  vi.stubEnv('IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH', '/public.pem');
  vi.stubEnv('IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256', 'a'.repeat(64));
  vi.stubEnv('IORI_MIGRATION_RECEIPT_PRIVATE_KEY_PATH', '/private.pem');
  vi.stubEnv('IORI_MIGRATION_REHEARSAL_PATH', '/rehearsal.json');
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cloudflare-token');
  vi.stubEnv('CLOUDFLARE_ZONE_ID', zoneId);
  vi.stubEnv('IORI_APPLICATION_R2_ACCESS_KEY_ID', 'application-key');
  vi.stubEnv('IORI_APPLICATION_R2_SECRET_ACCESS_KEY', 'application-secret');
  vi.stubEnv('IORI_MIGRATION_R2_ACCESS_KEY_ID', 'migration-key');
  vi.stubEnv('IORI_MIGRATION_R2_SECRET_ACCESS_KEY', 'migration-secret');
  vi.stubEnv('IORI_SOURCE_SSH_HOST', 'source.example');
  vi.stubEnv('IORI_SOURCE_SSH_USER', 'source');
  vi.stubEnv('IORI_SOURCE_SSH_IDENTITY_FILE', '/identity');
  vi.stubEnv('IORI_SOURCE_SSH_KNOWN_HOSTS_FILE', '/known-hosts');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it.each([
  ['migrate-data', true],
  ['rehearse', false],
])('does not pass an expected version to the sealed readback on the %s path', async (_path, withRehearsal) => {
  const record = preparationFixture();
  const run = vi.fn(async (options: { readTarget: (input: object) => Promise<unknown> }) => {
    const signal = new AbortController().signal;
    await options.readTarget({ expectedTarget: target, record, signal, expectedVersionId: 'injected-version' });
  });
  await runExecutorCli(new AbortController().signal, { run, withRehearsal });
  expect(run).toHaveBeenCalledTimes(1);
  expect(mocks.readSealed).toHaveBeenCalledTimes(1);
  const input = mocks.readSealed.mock.calls[0]![0];
  expect(input).toMatchObject({ expectedTarget: target, record, token: 'cloudflare-token', zoneId });
  expect(input.signal).toBeInstanceOf(AbortSignal);
  expect(input).not.toHaveProperty('expectedVersionId');
  expect(Object.keys(input).sort()).toEqual(['expectedTarget', 'record', 'signal', 'token', 'zoneId']);
});
