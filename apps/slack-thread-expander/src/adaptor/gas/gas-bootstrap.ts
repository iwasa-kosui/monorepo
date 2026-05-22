import { Result } from '@praha/byethrow';

import { BotId } from '../../domain/bot-id.ts';
import { ChannelId } from '../../domain/channel-id.ts';
import type { ConfigError } from '../../domain/config-error.ts';
import type { Config } from '../../domain/config.ts';
import { UserId } from '../../domain/user-id.ts';
import type { SlackHttpClientConfig } from '../slack/slack-http-client.ts';

const KEY_BOT_TOKEN = 'SLACK_BOT_TOKEN';
const KEY_USER_TOKEN = 'SLACK_USER_TOKEN';
const KEY_TARGET_CHANNELS = 'TARGET_CHANNELS';
const KEY_SELF_BOT_ID = 'SELF_BOT_ID';
const KEY_SELF_USER_ID = 'SELF_USER_ID';

export type GasBootstrap = Readonly<{
  slackCredentials: SlackHttpClientConfig;
  config: Config;
}>;

const requireProperty = (
  props: GoogleAppsScript.Properties.Properties,
  key: string,
): Result.Result<string, ConfigError> => {
  const value = props.getProperty(key);
  return value
    ? Result.succeed(value)
    : Result.fail({ kind: 'MissingProperty', key });
};

const parseChannelToken = (
  token: string,
): Result.Result<ChannelId, ConfigError> => {
  const parsed = ChannelId.parse(token);
  return parsed.success
    ? Result.succeed(parsed.data)
    : Result.fail({
      kind: 'InvalidProperty',
      key: KEY_TARGET_CHANNELS,
      reason: parsed.error.message,
    });
};

const parseChannels = (
  raw: string,
): Result.Result<ReadonlyArray<ChannelId>, ConfigError> =>
  Result.sequence(
    raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0),
    parseChannelToken,
  );

const parseSelfBotId = (
  raw: string | null,
): Result.Result<BotId | undefined, ConfigError> => {
  if (raw == null || raw.length === 0) return Result.succeed(undefined);
  const parsed = BotId.parse(raw);
  return parsed.success
    ? Result.succeed(parsed.data)
    : Result.fail({
      kind: 'InvalidProperty',
      key: KEY_SELF_BOT_ID,
      reason: parsed.error.message,
    });
};

const parseSelfUserId = (
  raw: string | null,
): Result.Result<UserId | undefined, ConfigError> => {
  if (raw == null || raw.length === 0) return Result.succeed(undefined);
  const parsed = UserId.parse(raw);
  return parsed.success
    ? Result.succeed(parsed.data)
    : Result.fail({
      kind: 'InvalidProperty',
      key: KEY_SELF_USER_ID,
      reason: parsed.error.message,
    });
};

export const loadGasBootstrap = (): Result.Result<GasBootstrap, ConfigError> => {
  const props = PropertiesService.getScriptProperties();
  return Result.pipe(
    Result.do(),
    Result.bind('botToken', () => requireProperty(props, KEY_BOT_TOKEN)),
    Result.bind('userToken', () => requireProperty(props, KEY_USER_TOKEN)),
    Result.bind('targetChannels', () => parseChannels(props.getProperty(KEY_TARGET_CHANNELS) ?? '')),
    Result.bind('selfBotId', () => parseSelfBotId(props.getProperty(KEY_SELF_BOT_ID))),
    Result.bind('selfUserId', () => parseSelfUserId(props.getProperty(KEY_SELF_USER_ID))),
    Result.map(({ botToken, userToken, targetChannels, selfBotId, selfUserId }): GasBootstrap => ({
      slackCredentials: { botToken, userToken },
      config: { targetChannels, selfBotId, selfUserId },
    })),
  );
};
