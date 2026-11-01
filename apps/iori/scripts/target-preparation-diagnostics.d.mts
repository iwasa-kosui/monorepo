export const PREPARATION_STAGES: readonly string[];
export const CONTROL_PLANE_APIS: readonly string[];
export function controlPlaneApi(path: string): string;
export function isPreparationReason(reason: unknown): boolean;
export function withReason(error: unknown, reason: string): Error & { diagnostic: { reason: string } };
export function preparationFailureLine(stage: unknown, error: unknown, aborted: boolean): string;
