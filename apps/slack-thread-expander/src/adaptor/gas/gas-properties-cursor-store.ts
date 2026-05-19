import type { ChannelId } from '../../domain/channel-id.ts';
import type { CursorPort } from '../../domain/cursor-port.ts';
import { SlackTs } from '../../domain/slack-ts.ts';

const KEY_PREFIX = 'LAST_TS_';

export const GasPropertiesCursorStore = {
  create: (): CursorPort => ({
    get: (channel: ChannelId) => {
      const raw = PropertiesService.getScriptProperties().getProperty(
        `${KEY_PREFIX}${channel}`,
      );
      if (raw == null) return undefined;
      const parsed = SlackTs.parse(raw);
      return parsed.success ? parsed.data : undefined;
    },
    set: (channel, ts) => {
      PropertiesService.getScriptProperties().setProperty(
        `${KEY_PREFIX}${channel}`,
        ts,
      );
    },
  }),
} as const;
