export function readSealedMigrationTarget(
  input: {
    expectedTarget: any;
    record: any;
    token: string | undefined;
    zoneId: string | undefined;
    fetchRequest?: (...args: any[]) => any;
    signal?: AbortSignal;
    expectedVersionId?: string;
  },
): Promise<{ resources: any; worker: any }>;
