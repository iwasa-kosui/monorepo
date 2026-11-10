import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { HashedPassword } from '../../../domain/password/password.ts';
import type { UserPasswordResolver } from '../../../domain/password/userPassword.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { userPasswordsTable } from '../schema.ts';

export const createD1UserPasswordResolver = (db: IoriD1Db): UserPasswordResolver => ({
  resolve: (userId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select()
          .from(userPasswordsTable)
          .where(eq(userPasswordsTable.userId, userId));
        if (!row) {
          return undefined;
        }
        if (rest.length > 0) {
          throw new Error(`Multiple passwords found with the same user ID: ${userId}`);
        }
        return {
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
        };
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
