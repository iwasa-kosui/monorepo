export function assertExternalMigrationPath(path: string): Promise<string>;
export function prepareExternalMigrationDirectory(directory: string): Promise<string>;
export function isMigrationArtifactReference(path: unknown): path is string;
export function assertExternalMigrationRoot(root: string): Promise<string>;
/** Resolve an existing regular file; empty data files are permitted. */
export function resolveMigrationArtifactPath(root: string, reference: string): Promise<string>;
