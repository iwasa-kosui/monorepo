export interface CloudflarePlan {
  operation: 'reconcile' | 'consumer-replacement' | 'route-cutover' | 'queue-pause' | 'queue-resume';
  allowProductionRoute?: boolean;
  requireWorkerBindingsNoop?: boolean;
  resource_changes?: readonly {
    address: string;
    change: { actions: readonly string[]; after?: { enabled?: boolean }; after_unknown?: { enabled?: boolean } };
  }[];
  output_changes?: {
    worker_bindings?: {
      actions?: readonly string[];
      before?: unknown;
      after?: unknown;
    };
  };
  planned_values?: {
    outputs?: {
      worker_bindings?: { value?: unknown };
    };
  };
}

export function validateCloudflarePlan(plan: CloudflarePlan): readonly string[];

export function validateQueuePausePlan(plan: CloudflarePlan): readonly string[];
