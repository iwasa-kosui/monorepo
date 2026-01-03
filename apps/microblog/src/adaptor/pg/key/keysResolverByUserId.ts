import { RA } from "@iwasa-kosui/result";
import { Key, type KeysResolverByUserId } from "../../../domain/key/key.ts";
import type { UserId } from "../../../domain/user/userId.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { keysTable } from "../schema.ts";
import { eq } from "drizzle-orm";

const getInstance = singleton((): KeysResolverByUserId => {
  const resolve = async (userId: UserId): RA<Key[], never> => {
    const rows = await DB.getInstance().select().from(keysTable).where(eq(keysTable.userId, userId));
    const keys = rows.map((row) => Key.parseOrThrow({
      id: row.keyId,
      type: row.type,
      userId: row.userId,
      privateKey: row.privateKey,
      publicKey: row.publicKey,
    }));
    return RA.ok(keys);
  }
  return { resolve };
})

export const PgKeysResolverByUserId = {
  getInstance,
} as const;
