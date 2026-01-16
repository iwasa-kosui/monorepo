import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Session, type SessionResolver } from '../../../domain/session/session.ts';
import type { SessionId } from '../../../domain/session/sessionId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { sessionsTable } from '../schema.ts';

const getInstance = singleton((): SessionResolver => {
  const resolve = async (sessionId: SessionId): RA<Session | undefined, never> => {
    const [row, ...rest] = await DB.getInstance().select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId));

    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple sessions found with the same ID: ${sessionId}`);
    }
    return RA.ok(Session.orThrow({
      sessionId: row.sessionId,
      userId: row.userId,
      expires: row.expires.getTime(),
    }));
  };
  return { resolve };
});

export const PgSessionResolver = {
  getInstance,
} as const;
