import { PasskeyCredential } from '../../../domain/passkey/passkeyCredential.ts';
import type { passkeyCredentialsTable } from '../schema.ts';

export const toPasskeyCredential = (row: typeof passkeyCredentialsTable.$inferSelect): PasskeyCredential =>
  PasskeyCredential.orThrow({
    credentialId: row.credentialId,
    userId: row.userId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: JSON.parse(row.transports) as PasskeyCredential['transports'],
    deviceType: row.deviceType as PasskeyCredential['deviceType'],
    backedUp: row.backedUp,
    name: row.name,
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.getTime(),
  });
