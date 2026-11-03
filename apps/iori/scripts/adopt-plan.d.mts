export interface AdoptPlanIssue {
  message: string;
  address?: string;
  actions?: readonly string[];
  attributes?: readonly string[];
}
export const ADOPT_ATTRIBUTE_WORDS: Readonly<Record<string, readonly string[]>>;
export const COMPUTED_ONLY_PATHS: Readonly<Record<string, readonly string[]>>;
export function isAdoptPlanDetail(detail: unknown): boolean;
export function adoptPlanDetails(issues: readonly AdoptPlanIssue[], prefix: 'drift' | 'diff'): string[];
export function inspectRefreshPlan(plan: unknown): AdoptPlanIssue[];
export function inspectAdoptedPlan(
  plan: unknown,
  expected: { hostname: string; workerName: string; zoneId: string },
): AdoptPlanIssue[];
