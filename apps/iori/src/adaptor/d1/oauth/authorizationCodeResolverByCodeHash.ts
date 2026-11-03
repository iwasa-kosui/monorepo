import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { AuthorizationCodeResolverByCodeHash } from '../../../domain/oauth/authorizationCode.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAuthorizationCodesTable } from '../schema.ts';
import { toAuthorizationCode } from './rows.ts';

export const createD1AuthorizationCodeResolverByCodeHash = (db: IoriD1Db): AuthorizationCodeResolverByCodeHash => ({
  resolve: (codeHash) =>
    RA.flow(
      fromD1(async () => {
        const [row] = await db.select().from(oauthAuthorizationCodesTable).where(
          eq(oauthAuthorizationCodesTable.codeHash, codeHash),
        );
        return row === undefined ? undefined : toAuthorizationCode(row);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
