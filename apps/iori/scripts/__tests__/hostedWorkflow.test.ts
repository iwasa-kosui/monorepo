import { lstat, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { materializeHostedValues } from '../hosted-workflow.mjs';
import { createWorkflowDirectory } from '../workflow-context.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';
const baseEnv = (operation: string) => ({
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  MAIN_SHA: 'a'.repeat(40),
  IORI_ENVIRONMENT: 'staging',
  IORI_GENERATION: 'fixture1',
  IORI_MIGRATION_RUN_ID: 'run1',
  IORI_OPERATION: operation,
});
it.each(['migrate-data', 'verify-import', 'cutover-route'])(
  'materializes %s into a new private root with only its required file roles',
  async operation => {
    const runnerTemp = await createFixtureDirectory('iori-hosted-');
    try {
      const paths = await createWorkflowDirectory(runnerTemp);
      const env = {
        ...baseEnv(operation),
        RUNNER_TEMP: runnerTemp,
        IORI_PRIVATE_DIRECTORY: paths.base,
        IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
        IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
        IORI_MIGRATION_RECEIPT_PUBLIC_KEY: 'synthetic-public-key',
        IORI_MIGRATION_RECEIPT_PRIVATE_KEY: 'synthetic-signing-key',
        IORI_MIGRATION_REHEARSAL: '{}',
      };
      const mapped = await materializeHostedValues(env);
      expect(await readdir(mapped.IORI_MIGRATION_ROOT!)).toEqual([]);
      expect((await lstat(mapped.IORI_MIGRATION_ROOT!)).mode & 0o777).toBe(0o700);
      expect((await lstat(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH!)).mode & 0o777).toBe(0o600);
      expect(await readFile(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH!, 'utf8')).toBe('synthetic-public-key');
      expect(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY).toBeUndefined();
      expect(mapped.IORI_MIGRATION_RECEIPT_PRIVATE_KEY).toBeUndefined();
      expect(mapped.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
      const files = await readdir(join(paths.base, 'keys'));
      expect(files.includes('receipt-private.pem')).toBe(operation === 'migrate-data');
      expect(files.includes('source-key')).toBe(operation !== 'verify-import');
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  },
);
it('rejects a retired operation before even examining any local secret path', async () => {
  await expect(
    materializeHostedValues({ ...baseEnv('replace-queue-consumer'), IORI_PRIVATE_DIRECTORY: '/not-inspected' }),
  ).rejects.toThrow('separate review');
});
