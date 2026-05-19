import { loadGasBootstrap } from '../adaptor/gas/gas-bootstrap.ts';
import { GasClock } from '../adaptor/gas/gas-clock.ts';
import { GasConsoleLogger } from '../adaptor/gas/gas-console-logger.ts';
import { GasLockService } from '../adaptor/gas/gas-lock-service.ts';
import { GasPropertiesCursorStore } from '../adaptor/gas/gas-properties-cursor-store.ts';
import { SlackHttpClient } from '../adaptor/slack/slack-http-client.ts';
import { ConfigError } from '../domain/config-error.ts';
import { runTick } from '../usecase/run-tick.ts';

export const tickHandler = (): void => {
  const logger = GasConsoleLogger.create();
  const bootRes = loadGasBootstrap();
  if (!bootRes.ok) {
    logger.error(`failed to load config: ${ConfigError.format(bootRes.err)}`);
    return;
  }
  const { slackCredentials, config } = bootRes.val;
  const slack = SlackHttpClient.create(slackCredentials);
  const cursor = GasPropertiesCursorStore.create();
  const clock = GasClock.create();
  const lock = GasLockService.create();
  runTick({ slack, cursor, clock, lock, logger })(config);
};
