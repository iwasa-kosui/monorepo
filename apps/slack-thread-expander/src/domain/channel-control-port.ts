import type { ChannelId } from './channel-id.ts';
import type { SlackTs } from './slack-ts.ts';

// 「expand を有効化しているか」「コントロールコマンド検索の進捗カーソル」など
// チャンネルごとに保持する on/off 制御用の状態を扱う。
export type ChannelControlPort = Readonly<{
  isEnabled: (channel: ChannelId) => boolean;
  setEnabled: (channel: ChannelId, enabled: boolean) => void;
  getControlCursor: (channel: ChannelId) => SlackTs | undefined;
  setControlCursor: (channel: ChannelId, ts: SlackTs) => void;
}>;
