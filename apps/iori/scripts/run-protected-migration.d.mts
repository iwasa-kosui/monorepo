export function assertProtectedMigrationContract(contract: unknown, expected?: {
  expectedMainSha?: string;
  expectedRunId?: string;
}): Readonly<{
  phases: readonly unknown[];
}>;

export function canonicalReceiptPayload(receipt: Record<string, unknown>): string;
export function loadReceiptPublicKey(path: string, expectedSha256: string): Promise<unknown>;

export function validateProtectedMigrationEvidence(contract: unknown, expected?: {
  expectedMainSha?: string;
  expectedRunId?: string;
  expectedMountedArtifacts?: Record<string, Record<string, unknown>>;
  receiptPublicKey?: unknown;
}): Promise<
  Readonly<{
    phases: readonly unknown[];
  }>
>;
