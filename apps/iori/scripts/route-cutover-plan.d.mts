export function validateRouteCutoverPlan(
  plan: object,
  expected: { hostname: string; workerName: string; zoneId: string },
): string[];
