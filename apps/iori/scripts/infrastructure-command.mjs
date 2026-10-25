import { runMigrationCommand } from './migration-command.mjs';
import { createPrivateCommandLog } from './private-command-log.mjs';
// Preserve private bounded stdout/stderr on success and failure before sanitized settlement.
export const runInfrastructureCommand = async (program, args, options) => {
  const env = options.env ?? process.env;
  const log = env.IORI_PRIVATE_LOG_DIRECTORY
    ? await createPrivateCommandLog(env.IORI_PRIVATE_LOG_DIRECTORY)
    : undefined;
  try {
    return {
      status: 0,
      ...await runMigrationCommand(program, args, {
        cwd: options.cwd ?? process.cwd(),
        env,
        timeout: 10 * 60_000,
        maxBuffer: 8_000_000,
        signal: options.signal,
        captureOutput: log?.capture,
      }),
    };
  } finally {
    await log?.close();
  }
};
