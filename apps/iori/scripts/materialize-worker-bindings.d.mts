export type WorkerBindings = {
  d1_database_id: string;
  r2_bucket_name: string;
  kv_namespace_id: string;
  queue_name: string;
  worker_name: string;
};

export function materializeWorkerBindings(input: {
  bindings: Record<string, unknown>;
  expectedWorkerName: string;
}): WorkerBindings;
