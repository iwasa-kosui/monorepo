import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Session, type SessionResolver } from '../../../domain/session/session.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { sessionsTable } from '../schema.ts';

const toTimestampMs = (timestamp: Date | number): number => timestamp instanceof Date ? timestamp.getTime() : timestamp;

export const createD1SessionResolver = (db: IoriD1Db): SessionResolver => ({
  resolve: (sessionId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select()
          .from(sessionsTable)
          .where(eq(sessionsTable.sessionId, sessionId));
        if (!row) {
          return undefined;
        }
        if (rest.length > 0) {
          throw new Error(`Multiple sessions found with the same ID: ${sessionId}`);
        }
        return Session.orThrow({
          sessionId: row.sessionId,
          userId: row.userId,
          expires: toTimestampMs(row.expires),
        });
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
