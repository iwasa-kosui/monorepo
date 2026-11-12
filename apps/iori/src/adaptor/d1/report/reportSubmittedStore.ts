import { RA } from '@iwasa-kosui/result';

import type { ReportSubmittedStore } from '../../../domain/report/report.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable } from '../schema.ts';

export const createD1ReportSubmittedStore = (db: IoriD1Db): ReportSubmittedStore => ({
  store: async (...events) => {
    const [first, ...rest] = events.map((event) => db.insert(domainEventsTable).values(toD1DomainEventRow(event)));
    if (first !== undefined) await db.batch([first, ...rest]);
    return RA.ok(undefined);
  },
});
