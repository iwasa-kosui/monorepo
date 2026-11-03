export const createDeploymentWorkerConfig: (options?: {
  withoutQueueProducer?: boolean;
  admissionMode?: string;
  admissionEnvironment?: Record<string, string>;
}) => Promise<{ path: string; cleanup: () => Promise<void> }>;
