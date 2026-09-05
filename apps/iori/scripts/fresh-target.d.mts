export type TargetInput = Readonly<
  { environment: string; generation: string; accountId: string; backendBucket: string }
>;
export type TargetIdentity =
  & TargetInput
  & Readonly<
    {
      backendKey: string;
      workerName: string;
      names: Readonly<{ d1: string; uploads: string; kv: string; queue: string; dlq: string; transfer: string }>;
    }
  >;
export function createTargetIdentity(input: TargetInput): TargetIdentity;
export function assertFreshTargetState(identity: TargetIdentity, state: unknown): void;
export function validateFreshTargetPlan(plan: unknown, identity: TargetIdentity, stage: string): string[];
