import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  AccessTokenResolverByTokenHash,
  AccessTokensResolverByAuthorizationCodeHash,
  AccessTokenUsageRecorder,
} from '../../../domain/oauth/accessToken.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAccessTokensTable } from '../schema.ts';
import { toAccessToken } from './rows.ts';

export const createD1AccessTokenResolverByTokenHash = (db: IoriD1Db): AccessTokenResolverByTokenHash => ({
  resolve: (tokenHash) =>
    RA.flow(
      fromD1(async () => {
        const [row] = await db.select().from(oauthAccessTokensTable).where(
          eq(oauthAccessTokensTable.tokenHash, tokenHash),
        );
        return row === undefined ? undefined : toAccessToken(row);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});

export const createD1AccessTokensResolverByAuthorizationCodeHash = (
  db: IoriD1Db,
): AccessTokensResolverByAuthorizationCodeHash => ({
  resolve: (codeHash) =>
    RA.flow(
      fromD1(async () => {
        const rows = await db.select().from(oauthAccessTokensTable).where(
          eq(oauthAccessTokensTable.authorizationCodeHash, codeHash),
        );
        return rows.map(toAccessToken);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});

export const createD1AccessTokenUsageRecorder = (db: IoriD1Db): AccessTokenUsageRecorder => ({
  record: ({ id, usedAt }) =>
    RA.flow(
      fromD1(async () => {
        await db.update(oauthAccessTokensTable)
          .set({ lastUsedAt: new Date(usedAt) })
          .where(eq(oauthAccessTokensTable.id, id));
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
