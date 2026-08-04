import { createD1Db } from './adaptor/d1/client.ts';
import { createPostImageR2ObjectStore } from './adaptor/r2/postImageObjectStore.ts';
import { createCloudflareFederationRuntime } from './federation.cloudflare.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

export const createIoriWorkerRuntime = async (env: IoriWorkerEnv) => ({
  db: createD1Db(env.DB),
  postImageObjectStore: createPostImageR2ObjectStore({
    bucket: env.UPLOADS,
  }),
  federation: await createCloudflareFederationRuntime(env),
});
