import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  OAuthApplicationResolver,
  OAuthApplicationResolverByClientId,
} from '../../../domain/oauth/oauthApplication.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthApplicationsTable } from '../schema.ts';
import { toOAuthApplication } from './rows.ts';

export const createD1OAuthApplicationResolver = (db: IoriD1Db): OAuthApplicationResolver => ({
  resolve: (id) =>
    RA.flow(
      fromD1(async () => {
        const [row] = await db.select().from(oauthApplicationsTable).where(eq(oauthApplicationsTable.id, id));
        return row === undefined ? undefined : toOAuthApplication(row);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});

export const createD1OAuthApplicationResolverByClientId = (db: IoriD1Db): OAuthApplicationResolverByClientId => ({
  resolve: (clientId) =>
    RA.flow(
      fromD1(async () => {
        const [row] = await db.select().from(oauthApplicationsTable).where(
          eq(oauthApplicationsTable.clientId, clientId),
        );
        return row === undefined ? undefined : toOAuthApplication(row);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
