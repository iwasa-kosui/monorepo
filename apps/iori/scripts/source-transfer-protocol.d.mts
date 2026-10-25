import type { z } from 'zod';
export type SourceIdentity = Readonly<{ main_sha: string; run_id: string }>;
export type SourceFile = Readonly<{ id: string; path: string; bytes: number; checksum: string }>;
export type SourceInventory = Readonly<
  { schemaVersion: 1; complete: true; identity: SourceIdentity; totalBytes: number; files: SourceFile[] }
>;
export const SOURCE_LIMITS: Readonly<
  {
    totalBytes: number;
    uploadBytes: number;
    inventoryBytes: number;
    inventoryFiles: number;
    exportMs: number;
    socketMs: number;
    transferMs: number;
    estimateMs: number;
  }
>;
export const sourceIdentitySchema: z.ZodType<SourceIdentity>;
export function logicalFilePath(id: string): string;
export function validateSourceInventory(value: unknown): SourceInventory;
