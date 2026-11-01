import type { PlanIssue } from './validate-cloudflare-plan.mjs';

export function validateRouteCutoverPlan(
  plan: object,
  expected: { hostname: string; workerName: string; zoneId: string },
): string[];

export function inspectRouteCutoverPlan(
  plan: object,
  expected: { hostname: string; workerName: string; zoneId: string },
): PlanIssue[];
