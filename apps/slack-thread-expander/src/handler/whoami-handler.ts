import { Result } from '@praha/byethrow';

import { loadGasBootstrap } from '../adaptor/gas/gas-bootstrap.ts';
import { GasConsoleLogger } from '../adaptor/gas/gas-console-logger.ts';
import { SlackHttpClient } from '../adaptor/slack/slack-http-client.ts';
import { ConfigError } from '../domain/config-error.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';

export const whoamiHandler = (): void => {
  const logger = GasConsoleLogger.create();
  const bootRes = loadGasBootstrap();
  if (Result.isFailure(bootRes)) {
    logger.error(`failed to load config: ${ConfigError.format(bootRes.error)}`);
    return;
  }
  const slack = SlackHttpClient.create(bootRes.value.slackCredentials);
  const identity = slack.authTest();
  if (Result.isFailure(identity)) {
    logger.error(`auth.test failed: ${SlackApiError.format(identity.error)}`);
    return;
  }
  const { botId, userId, user, team, teamId, url } = identity.value;
  logger.info(
    `whoami: bot_id=${botId ?? 'n/a'} user_id=${userId ?? 'n/a'} user=${user ?? 'n/a'} team=${team ?? 'n/a'} team_id=${
      teamId ?? 'n/a'
    } url=${url ?? 'n/a'}`,
  );
  if (botId != null) {
    logger.info(`SELF_BOT_ID: ${botId}`);
  } else {
    logger.warn('auth.test did not return bot_id; this token may not be a bot token');
  }
};
