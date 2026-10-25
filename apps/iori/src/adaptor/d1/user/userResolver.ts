import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { User, UserResolver } from '../../../domain/user/user.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { usersTable } from '../schema.ts';

export const createD1UserResolver = (db: IoriD1Db): UserResolver => ({
  resolve: (userId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select().from(usersTable).where(eq(usersTable.userId, userId));
        if (!row) {
          return undefined;
        }
        if (rest.length > 0) {
          throw new Error(`Multiple users found with the same ID: ${userId}`);
        }
        return {
          id: UserId.parseOrThrow(row.userId),
          username: Username.parseOrThrow(row.username),
        } satisfies User;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
