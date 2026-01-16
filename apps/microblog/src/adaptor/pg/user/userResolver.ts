import { RA } from "@iwasa-kosui/result"
import { eq } from "drizzle-orm"

import type { User, UserResolver } from "../../../domain/user/user.ts"
import { UserId } from "../../../domain/user/userId.ts"
import { Username } from "../../../domain/user/username.ts"
import { singleton } from "../../../helper/singleton.ts"
import { DB } from "../db.ts"
import { usersTable } from "../schema.ts"

const getInstance = singleton((): UserResolver => {
  const resolve = async (userId: UserId): RA<User | undefined, never> => {
    const db = DB.getInstance()
    const [row, ...rest] = await db.select().from(usersTable).where(eq(usersTable.userId, userId))
    if (!row) {
      return RA.ok(undefined)
    }
    if (rest.length > 0) {
      throw new Error(`Multiple users found with the same ID: ${userId}`)
    }
    return RA.ok({
      id: UserId.parseOrThrow(row.userId),
      username: Username.parseOrThrow(row.username),
    })
  }
  return { resolve }
})

export const PgUserResolver = {
  getInstance,
} as const;
