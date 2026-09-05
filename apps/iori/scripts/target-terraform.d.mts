import type { InfrastructureCommand } from './infrastructure-command.mjs';
import type { TargetIdentity } from './fresh-target.mjs';
export function createTargetTerraform(
  input: {
    identity: TargetIdentity;
    backendEndpoint: string;
    privateDirectory: string;
    zoneId: string;
    hostname: string;
    runCommand?: InfrastructureCommand;
    signal?: AbortSignal;
  },
): Readonly<{
  changeRoute(input: { establishedBindings: Record<string, string> }): Promise<{ applied: true }>;
  initializeActive(): Promise<
    {
      workerBindings: Record<string, string>;
      targetIdentity: Record<string, unknown>;
      migrationStorage: Record<string, string>;
    }
  >;
  changeQueuePause(
    input: { paused: boolean; establishedBindings: Record<string, string>; routeEnabled: boolean },
  ): Promise<{ applied: true }>;
  initializeEstablished(): Promise<
    {
      workerBindings: Record<string, string>;
      targetIdentity: Record<string, unknown>;
      migrationStorage: Record<string, string>;
    }
  >;
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
