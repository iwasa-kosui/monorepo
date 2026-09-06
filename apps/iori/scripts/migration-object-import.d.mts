import type { MigrationObjectWriter } from './migration-r2-writer.mjs';
type Options = { manifestPath: string; outputDir: string; bucket: MigrationObjectWriter; signal?: AbortSignal };
type Result = { manifestPath: string; count: number; bytes: number };
export function importMigrationUploads(input: Options & { sourceDir: string }): Promise<Result>;
export function importMigrationOgp(input: Options & { generate(title: string): Promise<Uint8Array> }): Promise<Result>;
export function objectManifestEnvelope(kind: string): string;
export function serializeObjectEntry(value: unknown): string;
