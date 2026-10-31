import type { ExecutorOptions } from './execute-protected-migration.mjs';
export type RehearsalOptions = Omit<ExecutorOptions, 'rehearsal'> & { freezeLimitMs?: number };
export const REHEARSAL_FREEZE_LIMIT_MS: number;
export function rehearseProtectedMigration(options: RehearsalOptions): Promise<{ status: 'measured'; key: string }>;
