import { RA } from '@iwasa-kosui/result';

import {
  type BlueskySyncFailedStore,
  BlueskySyncStatusRecord,
  type BlueskySyncStatusResolver,
  type BlueskySyncSucceededStore,
} from '../../../domain/blueskySyncStatus/blueskySyncStatus.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskySyncStatusTable } from '../schema.ts';

export const createD1BlueskySyncStatusResolver = (db: IoriD1Db): BlueskySyncStatusResolver => ({
  resolve: async () => {
    const rows = await db.select().from(blueskySyncStatusTable);
    return RA.ok(rows.map((row) =>
      BlueskySyncStatusRecord.parseOrThrow({
        scope: row.scope,
        lastSucceededAt: row.lastSucceededAt?.getTime() ?? null,
        lastFailedAt: row.lastFailedAt?.getTime() ?? null,
        lastFailureKind: row.lastFailureKind,
        lastFailureCode: row.lastFailureCode,
      })
    ));
  },
});

export const createD1BlueskySyncSucceededStore = (db: IoriD1Db): BlueskySyncSucceededStore => ({
  save: async (scope, at) => {
    const values = { lastSucceededAt: new Date(at) };
    await db.insert(blueskySyncStatusTable).values({ scope, ...values }).onConflictDoUpdate({
      target: blueskySyncStatusTable.scope,
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskySyncFailedStore = (db: IoriD1Db): BlueskySyncFailedStore => ({
  save: async (scope, at, kind, code) => {
    const values = { lastFailedAt: new Date(at), lastFailureKind: kind, lastFailureCode: code };
    await db.insert(blueskySyncStatusTable).values({ scope, ...values }).onConflictDoUpdate({
      target: blueskySyncStatusTable.scope,
      set: values,
    });
    return RA.ok(undefined);
  },
});
