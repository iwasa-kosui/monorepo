import { lstat } from 'node:fs/promises';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';

const requiredInputs = [
  'IORI_EXPORT_MANIFEST',
  'IORI_D1_IMPORT_MANIFEST',
  'IORI_R2_IMPORT_MANIFEST',
  'IORI_OGP_IMPORT_MANIFEST',
  'IORI_IMPORT_RUNNER',
];

export const assertPrivateMountedInput = async (path) => {
  const resolved = await assertExternalMigrationPath(path);
  const metadata = await lstat(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0 || (metadata.mode & 0o077) !== 0) {
    throw new Error('Protected mounted input is invalid.');
  }
};

export const validatePrivateMountedInputs = async (environment = process.env, { requireContract = false } = {}) => {
  const inputs = requireContract ? ['IORI_MIGRATION_CONTRACT', ...requiredInputs] : requiredInputs;
  try {
    for (const name of inputs) {
      if (typeof environment[name] !== 'string' || environment[name].length === 0) throw new Error('invalid');
      await assertPrivateMountedInput(environment[name]);
    }
  } catch {
    throw new Error('Protected mounted inputs are invalid.');
  }
};

if (process.argv[1]?.endsWith('validate-private-mounted-inputs.mjs')) {
  validatePrivateMountedInputs(process.env, { requireContract: process.argv.includes('--require-contract') })
    .catch(() => {
      console.error('Protected mounted inputs are invalid.');
      process.exitCode = 1;
    });
}
