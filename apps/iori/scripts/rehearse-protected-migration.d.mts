import type { ExecutorOptions } from './execute-protected-migration.mjs';
export type RehearsalOptions = Omit<ExecutorOptions, 'rehearsal'>;
export function rehearseProtectedMigration(options: RehearsalOptions): Promise<{ status: 'measured'; key: string }>;
