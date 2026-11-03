import { RA } from '@iwasa-kosui/result';

import type {
  OAuthApplicationRegistered,
  OAuthApplicationRegisteredStore,
} from '../../../domain/oauth/oauthApplication.ts';
import { Scope } from '../../../domain/oauth/scope.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthApplicationsTable } from '../schema.ts';
import { insertDomainEvent, runBatch } from './rows.ts';

export const createD1OAuthApplicationRegisteredStore = (db: IoriD1Db): OAuthApplicationRegisteredStore => ({
  store: (...events: readonly OAuthApplicationRegistered[]) =>
    RA.flow(
      fromD1(() =>
        runBatch(
          db,
          events.flatMap((event) => {
            const application = event.aggregateState;
            return [
              db.insert(oauthApplicationsTable).values({
                id: application.id,
                clientId: application.clientId,
                clientSecretHash: application.clientSecretHash,
                name: application.name,
                website: application.website,
                redirectUris: JSON.stringify(application.redirectUris),
                scopes: Scope.serialize(application.scopes),
                createdAt: new Date(application.createdAt),
              }),
              insertDomainEvent(db, event),
            ];
          }),
        )
      ),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
