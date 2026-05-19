import type { Result } from '@iwasa-kosui/result';
import { err, ok } from '@iwasa-kosui/result';

import { BotId } from '../../domain/bot-id.ts';
import { ChannelId } from '../../domain/channel-id.ts';
import type { ConfigError } from '../../domain/config-error.ts';
import type { Config } from '../../domain/config.ts';
import type { SlackHttpClientConfig } from '../slack/slack-http-client.ts';

const KEY_BOT_TOKEN = 'SLACK_BOT_TOKEN';
const KEY_USER_TOKEN = 'SLACK_USER_TOKEN';
const KEY_TARGET_CHANNELS = 'TARGET_CHANNELS';
const KEY_SELF_BOT_ID = 'SELF_BOT_ID';

export type GasBootstrap = Readonly<{
  slackCredentials: SlackHttpClientConfig;
  config: Config;
}>;

const requireProperty = (
  props: GoogleAppsScript.Properties.Properties,
  key: string,
): Result<string, ConfigError> => {
  const value = props.getProperty(key);
  return value ? ok(value) : err({ kind: 'MissingProperty', key });
};

const parseChannels = (raw: string): Result<ReadonlyArray<ChannelId>, ConfigError> => {
  const tokens = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const parsed: ChannelId[] = [];
  for (const t of tokens) {
    const r = ChannelId.parse(t);
    if (!r.success) {
      return err({
        kind: 'InvalidProperty',
        key: KEY_TARGET_CHANNELS,
        reason: r.error.message,
      });
    }
    parsed.push(r.data);
  }
  return ok(parsed);
};

const parseSelfBotId = (
  raw: string | null,
): Result<BotId | undefined, ConfigError> => {
  if (raw == null || raw.length === 0) return ok(undefined);
  const r = BotId.parse(raw);
  return r.success
    ? ok(r.data)
    : err({ kind: 'InvalidProperty', key: KEY_SELF_BOT_ID, reason: r.error.message });
};

export const loadGasBootstrap = (): Result<GasBootstrap, ConfigError> => {
  const props = PropertiesService.getScriptProperties();
  const botTokenRes = requireProperty(props, KEY_BOT_TOKEN);
  if (!botTokenRes.ok) return botTokenRes;
  const userTokenRes = requireProperty(props, KEY_USER_TOKEN);
  if (!userTokenRes.ok) return userTokenRes;
  const channelsRes = parseChannels(props.getProperty(KEY_TARGET_CHANNELS) ?? '');
  if (!channelsRes.ok) return channelsRes;
  const selfBotIdRes = parseSelfBotId(props.getProperty(KEY_SELF_BOT_ID));
  if (!selfBotIdRes.ok) return selfBotIdRes;
  return ok({
    slackCredentials: {
      botToken: botTokenRes.val,
      userToken: userTokenRes.val,
    },
    config: {
      targetChannels: channelsRes.val,
      selfBotId: selfBotIdRes.val,
    },
  });
};
