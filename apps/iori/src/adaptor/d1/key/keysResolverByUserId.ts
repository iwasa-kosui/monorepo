import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Key, type KeysResolverByUserId } from '../../../domain/key/key.ts';
import { KeyType } from '../../../domain/key/keyType.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { keysTable } from '../schema.ts';

const parseKeyType = (type: string) => {
  if (type === KeyType.rsa || type === KeyType.ed25519) return type;
  throw new Error(`Unknown key type: ${type}`);
};

export const createD1KeysResolverByUserId = (db: IoriD1Db): KeysResolverByUserId => ({
  resolve: (userId) =>
    RA.flow(
      fromD1(async () =>
        (await db.select().from(keysTable).where(eq(keysTable.userId, userId))).map((row) =>
          Key.orThrow({
            id: row.keyId,
            type: parseKeyType(row.type),
            userId: row.userId,
            privateKey: row.privateKey,
            publicKey: row.publicKey,
          })
        )
      ),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
