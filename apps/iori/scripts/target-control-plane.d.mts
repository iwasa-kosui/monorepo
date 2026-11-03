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
  resolveActiveResources(): Promise<
    { d1Id: string; kvId: string; queueId: string; dlqId: string; consumerId: string }
  >;
  readActiveResources(
    ids: ResourceIds,
  ): Promise<
    Omit<TargetResourceReadback, 'queuePaused'> & {
      queuePaused: false;
      queueConfiguration: Record<string, unknown>;
      dlqConfiguration: Record<string, unknown>;
    }
  >;
  readActiveWorker(
    input: {
      resources: Omit<TargetResourceReadback, 'queuePaused'> & { queuePaused: false };
      admissionEnvironment: Record<string, string>;
      zoneId: string;
      expectedVersionId: string;
      routePresent: true;
    },
  ): Promise<{ versionId: string; routeConfiguration: unknown[] }>;
  readCurrentVersion(): Promise<string>;
}>;
