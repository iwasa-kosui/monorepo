import {
  createD1BlueskySyncFailedStore,
  createD1BlueskySyncSucceededStore,
} from '../adaptor/d1/blueskySyncStatus/blueskySyncStatusStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import type {
  BlueskySyncFailedStore,
  BlueskySyncSucceededStore,
} from '../domain/blueskySyncStatus/blueskySyncStatus.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';

export type BlueskySyncStatusRecorder = Readonly<{
  succeededStore: BlueskySyncSucceededStore;
  failedStore: BlueskySyncFailedStore;
}>;

export const createBlueskySyncStatusRecorder = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db }> = {},
): BlueskySyncStatusRecorder => {
  const db = deps.db ?? createD1Db(env.DB);
  return {
    succeededStore: createD1BlueskySyncSucceededStore(db),
    failedStore: createD1BlueskySyncFailedStore(db),
  };
};
