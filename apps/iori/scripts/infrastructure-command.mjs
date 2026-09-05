import { runMigrationCommand } from './migration-command.mjs';

// Preserve the existing command-result shape while actually awaiting the owned process group.
export const runInfrastructureCommand = async (program, args, options) => ({
  status: 0,
  ...await runMigrationCommand(program, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    timeout: 10 * 60_000,
    maxBuffer: 8_000_000,
    signal: options.signal,
  }),
});
