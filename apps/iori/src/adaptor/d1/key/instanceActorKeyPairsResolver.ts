import { exportJwk, generateCryptoKeyPair, importJwk } from '@fedify/fedify';
import { eq } from 'drizzle-orm';

import { KeyType } from '../../../domain/key/keyType.ts';
import type { IoriD1Db } from '../client.ts';
import { instanceActorKeysTable } from '../schema.ts';

export type InstanceActorKeyPairsResolver = Readonly<{
  resolve: () => Promise<CryptoKeyPair[]>;
}>;

export const createD1InstanceActorKeyPairsResolver = (db: IoriD1Db): InstanceActorKeyPairsResolver => ({
  resolve: async () => {
    const keyPairs: CryptoKeyPair[] = [];
    for (const type of KeyType.values) {
      const [existing] = await db.select().from(instanceActorKeysTable)
        .where(eq(instanceActorKeysTable.type, type)).limit(1);
      if (existing !== undefined) {
        keyPairs.push({
          privateKey: await importJwk(JSON.parse(existing.privateKey), 'private'),
          publicKey: await importJwk(JSON.parse(existing.publicKey), 'public'),
        });
        continue;
      }
      const keyPair = await generateCryptoKeyPair(type);
      const [privateKey, publicKey] = await Promise.all([exportJwk(keyPair.privateKey), exportJwk(keyPair.publicKey)]);
      await db.insert(instanceActorKeysTable).values({
        keyId: crypto.randomUUID(),
        type,
        privateKey: JSON.stringify(privateKey),
        publicKey: JSON.stringify(publicKey),
      });
      keyPairs.push(keyPair);
    }
    return keyPairs;
  },
});
