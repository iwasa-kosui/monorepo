export type TargetInput = Readonly<{ environment: string; generation: string; accountId: string }>;
export type TargetIdentity =
  & TargetInput
  & Readonly<
    {
      backendKey: string;
      workerName: string;
      names: Readonly<
        { d1: string; uploads: string; eventArchive: string; kv: string; queue: string; dlq: string; transfer: string }
      >;
    }
  >;
export function createTargetIdentity(input: TargetInput): TargetIdentity;
