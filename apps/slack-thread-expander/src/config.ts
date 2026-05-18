const KEY_BOT_TOKEN = 'SLACK_BOT_TOKEN';
const KEY_TARGET_CHANNELS = 'TARGET_CHANNELS';
const KEY_SELF_BOT_ID = 'SELF_BOT_ID';
const KEY_LAST_TS_PREFIX = 'LAST_TS_';

export type Config = {
  botToken: string;
  targetChannels: readonly string[];
  selfBotId: string | undefined;
};

const properties = (): GoogleAppsScript.Properties.Properties => PropertiesService.getScriptProperties();

export const loadConfig = (): Config => {
  const props = properties();
  const botToken = props.getProperty(KEY_BOT_TOKEN);
  if (!botToken) {
    throw new Error(
      `Script Property "${KEY_BOT_TOKEN}" is required. Set it via スクリプトのプロパティ in GAS editor.`,
    );
  }
  const rawChannels = props.getProperty(KEY_TARGET_CHANNELS) ?? '';
  const targetChannels = rawChannels
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const selfBotId = props.getProperty(KEY_SELF_BOT_ID) ?? undefined;
  return { botToken, targetChannels, selfBotId };
};

export const getLastTs = (channelId: string): string | null =>
  properties().getProperty(`${KEY_LAST_TS_PREFIX}${channelId}`);

export const setLastTs = (channelId: string, ts: string): void => {
  properties().setProperty(`${KEY_LAST_TS_PREFIX}${channelId}`, ts);
};

export const deleteLastTs = (channelId: string): void => {
  properties().deleteProperty(`${KEY_LAST_TS_PREFIX}${channelId}`);
};

export const nowAsSlackTs = (): string => {
  const epochSeconds = Math.floor(Date.now() / 1000);
  return `${epochSeconds}.000000`;
};
