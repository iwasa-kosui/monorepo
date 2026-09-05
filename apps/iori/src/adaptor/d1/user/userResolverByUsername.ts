import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { User, UserResolverByUsername } from '../../../domain/user/user.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { usersTable } from '../schema.ts';

export const createD1UserResolverByUsername = (db: IoriD1Db): UserResolverByUsername => ({
  resolve: (username) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select().from(usersTable).where(eq(usersTable.username, username));
        if (!row) {
          return undefined;
        }
        if (rest.length > 0) {
          throw new Error(`Multiple users found with the same username: ${username}`);
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
