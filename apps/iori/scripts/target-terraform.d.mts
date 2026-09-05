import type { TargetIdentity } from './fresh-target.mjs';
export function createTargetTerraform(
  input: {
    identity: TargetIdentity;
    backendEndpoint: string;
    privateDirectory: string;
    zoneId: string;
    hostname: string;
    runCommand?: (
      command: string,
      args: string[],
      options: object,
    ) => { status: number | null; stdout?: string; stderr?: string };
  },
): Readonly<{
  changeQueuePause(
    input: { paused: boolean; establishedBindings: Record<string, string>; routeEnabled: boolean },
  ): Promise<{ applied: true }>;
  initializeFresh(): Promise<{ backendKey: string; resourceCount: 0 }>;
  prepare(
    stage: 'resources' | 'consumer',
    input?: { establishedBindings?: Record<string, string> },
  ): Promise<
    {
      workerBindings: Record<string, string>;
      targetIdentity: Record<string, unknown>;
      migrationStorage: Record<string, string>;
    }
  >;
}>;
