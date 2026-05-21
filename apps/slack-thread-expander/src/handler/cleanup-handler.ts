import { Result } from '@praha/byethrow';

import { loadGasBootstrap } from '../adaptor/gas/gas-bootstrap.ts';
import { GasClock } from '../adaptor/gas/gas-clock.ts';
import { GasConsoleLogger } from '../adaptor/gas/gas-console-logger.ts';
import { GasLockService } from '../adaptor/gas/gas-lock-service.ts';
import { SlackHttpClient } from '../adaptor/slack/slack-http-client.ts';
import { ConfigError } from '../domain/config-error.ts';
import { runCleanup } from '../usecase/run-cleanup.ts';

export const cleanupHandler = (): void => {
  const logger = GasConsoleLogger.create();
  const bootRes = loadGasBootstrap();
  if (Result.isFailure(bootRes)) {
    logger.error(`failed to load config: ${ConfigError.format(bootRes.error)}`);
    return;
  }
  const { slackCredentials, config } = bootRes.value;
  const slack = SlackHttpClient.create(slackCredentials);
  const clock = GasClock.create();
  const lock = GasLockService.create();
  runCleanup({ slack, clock, lock, logger })(config);
};
