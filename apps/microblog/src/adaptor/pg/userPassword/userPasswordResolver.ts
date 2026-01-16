import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { HashedPassword } from '../../../domain/password/password.ts';
import type { UserPasswordResolver } from '../../../domain/password/userPassword.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { userPasswordsTable } from '../schema.ts';

const getInstance = singleton((): UserPasswordResolver => {
  const resolve = async (userId: UserId) => {
    const [row, ...rest] = await DB.getInstance().select()
      .from(userPasswordsTable)
      .where(eq(userPasswordsTable.userId, userId));

    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple passwords found with the same user ID: ${userId}`);
    }
    return RA.ok({
      userId: UserId.orThrow(row.userId),
      hashedPassword: HashedPassword.orThrow({
        algorithm: row.algorithm,
        parallelism: row.parallelism,
        tagLength: row.tagLength,
        memory: row.memory,
        passes: row.passes,
        nonceHex: row.nonceHex,
        tagHex: row.tagHex,
      }),
    });
  };
  return { resolve };
});

export const PgUserPasswordResolver = {
  getInstance,
} as const;
