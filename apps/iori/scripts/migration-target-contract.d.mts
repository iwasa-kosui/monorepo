import type { TargetIdentity } from './fresh-target.mjs';
export type ExpectedTarget = {
  schema: 'iori-migration-expected-target/v1';
  identity: {
    environment: 'production' | 'staging';
    generation: string;
    main_sha: string;
    run_id: string;
    account_id: string;
    backend_bucket: string;
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
export type PreparedObservation = {
  worker_version_id: string;
  admission_mode: 'sealed';
  previews_enabled: false;
  route_present: false;
  queue_delivery_paused: true;
  dlq_delivery_paused: true;
  consumer_id: string;
};
export type PreparationRecord = Omit<ExpectedTarget, 'schema'> & {
  schema: 'iori-target-preparation/v1';
  observed: PreparedObservation;
};
export type TargetSummary = Omit<PreparationRecord, 'schema'> & {
  schema: 'iori-migration-phase-artifact/v1/terraform_target_summary';
  status: 'completed';
  preparation: { record_sha256: string; record: PreparationRecord };
};
export const TARGET_BYTES: number;
export const migrationRunIdPattern: RegExp;
export function targetHash(body: string | Buffer): string;
export function targetIdentity(target: ExpectedTarget): TargetIdentity;
export function admissionEnvironment(
  target: ExpectedTarget,
): { IORI_ADMISSION_MODE: string; IORI_ADMISSION_IDENTITY: string; ORIGIN: string };
export function parseExpectedTarget(input: unknown): ExpectedTarget;
export function preparationRecordKey(target: ExpectedTarget): string;
export function serializePreparationRecord(input: unknown): Buffer;
export function parsePreparationRecord(
  body: Buffer,
  expected: ExpectedTarget,
): { record: PreparationRecord; sha256: string };
export function assertTargetSummary(input: unknown, expected: ExpectedTarget): TargetSummary;
export function expectedTargetFromOutputs(
  input: {
    identity: TargetIdentity;
    mainSha: string;
    runId: string;
    admission: ExpectedTarget['admission'];
    outputs: {
      workerBindings: Record<string, string>;
      targetIdentity: Record<string, unknown>;
      migrationStorage: Record<string, string>;
    };
  },
): ExpectedTarget;

export const activeTargetFromOutputs: typeof expectedTargetFromOutputs;
