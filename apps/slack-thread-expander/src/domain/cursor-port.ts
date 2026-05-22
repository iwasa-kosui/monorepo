import type { ChannelId } from './channel-id.ts';
import type { SlackTs } from './slack-ts.ts';

export type CursorPort = Readonly<{
  get: (channel: ChannelId) => SlackTs | undefined;
  set: (channel: ChannelId, ts: SlackTs) => void;
  clear: (channel: ChannelId) => void;
}>;
