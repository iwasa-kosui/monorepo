import type { ChannelControlPort } from '../../domain/channel-control-port.ts';
import type { ChannelId } from '../../domain/channel-id.ts';
import { SlackTs } from '../../domain/slack-ts.ts';

const ENABLED_PREFIX = 'ENABLED_';
const CONTROL_TS_PREFIX = 'CONTROL_TS_';

export const GasPropertiesChannelControlStore = {
  create: (): ChannelControlPort => ({
    isEnabled: (channel: ChannelId) => {
      const raw = PropertiesService.getScriptProperties().getProperty(
        `${ENABLED_PREFIX}${channel}`,
      );
      return raw === 'true';
    },
    setEnabled: (channel, enabled) => {
      const props = PropertiesService.getScriptProperties();
      if (enabled) {
        props.setProperty(`${ENABLED_PREFIX}${channel}`, 'true');
      } else {
        props.deleteProperty(`${ENABLED_PREFIX}${channel}`);
      }
    },
    getControlCursor: (channel: ChannelId) => {
      const raw = PropertiesService.getScriptProperties().getProperty(
        `${CONTROL_TS_PREFIX}${channel}`,
      );
      if (raw == null) return undefined;
      const parsed = SlackTs.parse(raw);
      return parsed.success ? parsed.data : undefined;
    },
    setControlCursor: (channel, ts) => {
      PropertiesService.getScriptProperties().setProperty(
        `${CONTROL_TS_PREFIX}${channel}`,
        ts,
      );
    },
  }),
} as const;
