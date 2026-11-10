import type { TargetIdentity } from './fresh-target.mjs';
export type ExpectedTarget = {
  schema: 'iori-migration-expected-target/v1';
  identity: {
    environment: 'production' | 'staging';
    generation: string;
    main_sha: string;
    run_id: string;
    account_id: string;
    backend_key: string;
    worker_name: string;
  };
  resources: {
    d1: { id: string; name: string };
    kv: { id: string; name: string };
    uploads: { name: string };
    transfer: { name: string };
    queue: { id: string; name: string };
    dlq: { id: string; name: string };
    consumer: { id: string; queue_id: string; worker_name: string; dead_letter_queue_id: string };
  };
  admission: {
    environment: 'production' | 'staging';
    generation: string;
    mainSha: string;
    runId: string;
    hostname: string;
    workerHostname: string;
    smoke: { username: string; uploadFilename: string; articleId: string };
  };
};
export type ResolvedActiveIds = {
  d1Id: string;
  kvId: string;
  queueId: string;
  dlqId: string;
  consumerId: string;
};
export const migrationRunIdPattern: RegExp;
export function targetIdentity(target: ExpectedTarget): TargetIdentity;
export function admissionEnvironment(
  target: ExpectedTarget,
): { IORI_ADMISSION_MODE: string; IORI_ADMISSION_IDENTITY: string; ORIGIN: string };
export function parseExpectedTarget(input: unknown): ExpectedTarget;
export function activeTargetFromResolvedIds(
  input: {
    identity: TargetIdentity;
    mainSha: string;
    runId: string;
    admission: ExpectedTarget['admission'];
    resolved: ResolvedActiveIds;
  },
): ExpectedTarget;
