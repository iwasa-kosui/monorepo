import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { User, UserResolverByUsername } from '../../../domain/user/user.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { usersTable } from '../schema.ts';

const getInstance = singleton((): UserResolverByUsername => {
  const resolve = async (username: Username): RA<User | undefined, never> => {
    const db = DB.getInstance();
    const [row, ...rest] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple users found with the same username: ${username}`);
    }
    return RA.ok({
      id: UserId.parseOrThrow(row.userId),
      username: Username.parseOrThrow(row.username),
    });
  };
  return { resolve };
});

export const PgUserResolverByUsername = {
  getInstance,
} as const;
