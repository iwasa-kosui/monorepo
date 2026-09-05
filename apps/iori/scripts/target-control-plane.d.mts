import type { TargetIdentity } from './fresh-target.mjs';
export type ResourceIds = Readonly<
  { d1Id: string; kvId: string; queueId: string; dlqId: string; consumerAttached?: boolean }
>;
export type TargetResourceReadback =
  & ResourceIds
  & Readonly<
    {
      identity: TargetIdentity;
      queueCreatedOn: string;
      dlqCreatedOn: string;
      queueSettings: Record<string, unknown>;
      consumerId: string | null;
      queuePaused: true;
    }
  >;
export function createTargetControlPlane(
  input: {
    identity: TargetIdentity;
    token: string;
    signal?: AbortSignal;
    fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
  },
): Readonly<{
  readQueuePause(input: { queueId: string; paused: boolean }): Promise<{ queueId: string; paused: boolean }>;
  assertFresh(): Promise<{ fresh: true; resourceCount: 0 }>;
  readResources(ids: ResourceIds): Promise<TargetResourceReadback>;
  readWorkerAdmission(
    input: {
      resources: TargetResourceReadback;
      admissionEnvironment: Record<string, string>;
      zoneId: string;
      expectedVersionId: string;
      routePresent?: boolean;
    },
  ): Promise<
    {
      versionId: string;
      workerName: string;
      mode: string;
      previewsEnabled: false;
      routeCount: number;
      bindingCount: number;
    }
  >;
  readSealedWorker(
    input: {
      resources: TargetResourceReadback;
      admissionEnvironment: Record<string, string>;
      zoneId: string;
      expectedVersionId: string;
    },
  ): Promise<
    {
      versionId: string;
      workerName: string;
      mode: 'sealed';
      previewsEnabled: false;
      routeCount: 0;
      bindingCount: number;
    }
  >;
}>;
