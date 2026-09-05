import type { TargetIdentity } from './fresh-target.mjs';
import type { TargetResourceReadback } from './target-control-plane.mjs';
export function createTargetPreparation(
  options: {
    identity: TargetIdentity;
    token: string;
    backendEndpoint: string;
    privateDirectory: string;
    zoneId: string;
    hostname: string;
    fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
    runCommand?: (
      command: string,
      args: string[],
      options: object,
    ) => { status: number | null; stdout?: string; stderr?: string };
  },
): Readonly<{
  prepareResources(): Promise<
    {
      workerBindings: Record<string, string>;
      targetIdentity: Record<string, unknown>;
      migrationStorage: Record<string, string>;
      resources: TargetResourceReadback;
      summary: { freshGeneration: true; storageResources: 4; queues: 2; queuePaused: true; consumerCount: 0 };
    }
  >;
  attachSealedConsumer(
    input: { admissionEnvironment: Record<string, string>; zoneId: string; expectedVersionId: string },
  ): Promise<
    {
      resources: TargetResourceReadback;
      worker: Record<string, unknown>;
      workerBindings: Record<string, string>;
      targetIdentity: Record<string, unknown>;
      migrationStorage: Record<string, string>;
      summary: { queuePaused: true; consumerCount: 1; sealedWorker: true };
    }
  >;
}>;
