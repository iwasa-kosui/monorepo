import { createHash, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { parseMigrationRehearsal } from './migration-budget.mjs';
import { loadReceiptPublicKey } from './run-protected-migration.mjs';

const ENVELOPE_BYTES = 65536;
export const REHEARSAL_SIGNING_PREFIX = 'iori-migration-rehearsal-envelope/v1\n';
const envelopeSchema = z.object({
  schema: z.literal('iori-migration-rehearsal-envelope/v1'),
  profile: z.string().min(1).max(ENVELOPE_BYTES),
  profile_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();
export const verifyRehearsalEnvelope = (envelopeText, publicKey, mainSha) => {
  try {
    const envelope = envelopeSchema.parse(JSON.parse(envelopeText));
    const signature = Buffer.from(envelope.signature, 'base64');
    if (
      publicKey?.asymmetricKeyType !== 'ed25519'
      || createHash('sha256').update(envelope.profile).digest('hex') !== envelope.profile_sha256
      || !verify(null, Buffer.from(`${REHEARSAL_SIGNING_PREFIX}${envelope.profile}`), publicKey, signature)
    ) throw new Error('invalid');
    parseMigrationRehearsal(JSON.parse(envelope.profile), mainSha);
    return envelope.profile;
  } catch {
    throw new Error('Rehearsal profile verification failed.');
  }
};

const main = async ([envelopePath, publicKeyPath, publicKeySha256, mainSha]) => {
  if (!envelopePath || !publicKeyPath || !publicKeySha256 || !mainSha) throw new Error('invalid');
  const envelope = await readFile(envelopePath);
  if (envelope.length > ENVELOPE_BYTES * 2) throw new Error('invalid');
  const publicKey = await loadReceiptPublicKey(publicKeyPath, publicKeySha256);
  process.stdout.write(verifyRehearsalEnvelope(envelope.toString('utf8'), publicKey, mainSha));
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Rehearsal profile verification failed.');
    process.exitCode = 1;
  });
}
