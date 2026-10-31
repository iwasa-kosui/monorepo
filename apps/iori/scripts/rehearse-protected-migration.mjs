import { createHash, sign } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { assertSigner, runExecutorCli, runProtectedPhases } from './execute-protected-migration.mjs';
import { migrationBudget, migrationWorkload, parseMigrationRehearsal } from './migration-budget.mjs';
import { parseExpectedTarget, rehearsalProfileKey, rehearsalTargetKey } from './migration-target-contract.mjs';

const REHEARSAL_D1_CAPACITY_BYTES = 10_000_000_000;
const RESUME_TIMEOUT_MS = 120_000;
const seconds = (ms) => Math.max(ms, 1) / 1000;
const measureProfile = ({ mainSha, estimate, elapsed }) => {
  const { raw, sqlBytes, fileCount } = migrationWorkload(estimate);
  const tExport = seconds(elapsed['export-postgres']);
  const tD1 = seconds(elapsed['convert-and-import-d1']);
  const tObj = seconds(elapsed['import-r2-and-ogp']);
  return parseMigrationRehearsal({
    schema: 'iori-migration-rehearsal/v1',
    main_sha: mainSha,
    measured_at: new Date().toISOString(),
    bytes_per_second: (raw * 3 + sqlBytes) / (tExport + tD1),
    rows_per_second: estimate.rows * 3 / tD1,
    files_per_second: (estimate.upload_count * 3 + fileCount * 2) / (tD1 + tObj),
    ogp_per_second: estimate.article_count / tObj,
    d1_capacity_bytes: REHEARSAL_D1_CAPACITY_BYTES,
  }, mainSha);
};
export const rehearseProtectedMigration = async (options) => {
  const target = parseExpectedTarget(options.expectedTarget);
  const { storage, source, receiptPrivateKey, receiptPublicKey } = options;
  const { main_sha: mainSha, run_id: runId } = target.identity;
  assertSigner(receiptPrivateKey, receiptPublicKey);
  let frozen = false;
  const resume = () => {
    if (!frozen) return undefined;
    frozen = false;
    return source.resume('destination_writes_not_enabled', AbortSignal.timeout(RESUME_TIMEOUT_MS));
  };
  let result;
  let failure;
  let failed = false;
  try {
    result = await runProtectedPhases(options, target, {
      budget: ({ estimate, availableBytes }) => {
        if (!estimate.rows || !estimate.upload_count || !estimate.article_count) {
          throw new Error('Rehearsal sample is insufficient.');
        }
        migrationBudget({ estimate, d1CapacityBytes: REHEARSAL_D1_CAPACITY_BYTES, availableBytes });
      },
      beforeReservation: async () => {
        await storage.putNew(
          rehearsalTargetKey(target),
          Buffer.from(
            JSON.stringify({ schema: 'iori-migration-rehearsal-target/v1', main_sha: mainSha, run_id: runId }) + '\n',
          ),
        );
      },
      beforeFreeze: () => {
        frozen = true;
      },
      afterExport: resume,
      finish: async ({ estimate, elapsed }) => {
        const profile = JSON.stringify(measureProfile({ mainSha, estimate, elapsed }));
        const envelope = Buffer.from(
          JSON.stringify({
            schema: 'iori-migration-rehearsal-envelope/v1',
            profile,
            profile_sha256: createHash('sha256').update(profile).digest('hex'),
            signature: sign(null, Buffer.from(profile, 'utf8'), receiptPrivateKey).toString('base64'),
          }) + '\n',
        );
        const key = rehearsalProfileKey(target);
        await storage.putNew(key, envelope);
        const stored = await storage.get(key, 65536);
        if (!stored.equals(envelope)) throw new Error('Rehearsal profile readback failed.');
        return { status: 'measured', key };
      },
    });
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await resume();
  } catch (resumeError) {
    throw failed
      ? new AggregateError([failure, resumeError], 'Source resume failed after rehearsal failure.')
      : resumeError;
  }
  if (failed) throw failure;
  return result;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => runExecutorCli(signal, { run: rehearseProtectedMigration, withRehearsal: false })).then(() =>
    console.log('Migration rehearsal profile recorded.')
  ).catch(() => {
    console.error(
      'Migration rehearsal failed; confirm the source is unfrozen and retain the generation, reservations and partial evidence for review.',
    );
    process.exitCode = 1;
  });
}
