import { Result } from '@praha/byethrow';

import type { ChannelControlPort } from '../domain/channel-control-port.ts';
import type { ChannelId } from '../domain/channel-id.ts';
import type { ClockPort } from '../domain/clock-port.ts';
import { ControlCommand } from '../domain/control-command.ts';
import type { CursorPort } from '../domain/cursor-port.ts';
import type { LoggerPort } from '../domain/logger-port.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';
import type { RecentMessage, SlackPort } from '../domain/slack-port.ts';
import { SlackTs } from '../domain/slack-ts.ts';
import type { UserId } from '../domain/user-id.ts';
import { assertNever } from '../util/assert-never.ts';

export type ProcessControlCommandsDeps = Readonly<{
  slack: SlackPort;
  cursor: CursorPort;
  channelControl: ChannelControlPort;
  clock: ClockPort;
  logger: LoggerPort;
}>;

export type ChannelControlOutcome = Readonly<{
  channel: ChannelId;
  enabledAfter: boolean;
  applied: ReadonlyArray<{ ts: SlackTs; kind: ControlCommand['kind'] }>;
  cursorTo: SlackTs;
}>;

const REPLY_ON = 'スレッド展開を ON にしました。今後の新規スレッド返信を対象に展開します。';
const REPLY_OFF = 'スレッド展開を OFF にしました。再度 ON にすると、その時点より新しい投稿だけが対象になります。';
const REPLY_UNKNOWN = 'コマンドを認識できませんでした (on / オン / off / オフ)。';

// スレッド本流（thread_ts なし）かつ subtype がないユーザー発言だけを対象にする。
// Bot 自身の返信や thread_broadcast を制御コマンドとして拾わないためのフィルタ。
const isCandidate = (message: RecentMessage): boolean =>
  message.threadTs == null && message.subtype == null && message.text != null;

const sendReply = (
  deps: ProcessControlCommandsDeps,
  label: string,
  channel: ChannelId,
  threadTs: SlackTs,
  text: string,
): void => {
  const res = deps.slack.postMessage({ channel, text, threadTs });
  if (Result.isFailure(res)) {
    deps.logger.warn(
      `${label} failed to reply control feedback ts=${threadTs}: ${SlackApiError.format(res.error)}`,
    );
  }
};

const applyOn = (
  deps: ProcessControlCommandsDeps,
  label: string,
  channel: ChannelId,
  ts: SlackTs,
  state: { enabled: boolean },
): void => {
  deps.channelControl.setEnabled(channel, true);
  state.enabled = true;
  deps.logger.info(`${label} control ON applied ts=${ts}`);
  sendReply(deps, label, channel, ts, REPLY_ON);
};

const applyOff = (
  deps: ProcessControlCommandsDeps,
  label: string,
  channel: ChannelId,
  ts: SlackTs,
  state: { enabled: boolean },
): void => {
  deps.channelControl.setEnabled(channel, false);
  // 再度 ON にした際に、ON 後の投稿のみを対象とするため LAST_TS をクリアする。
  deps.cursor.clear(channel);
  state.enabled = false;
  deps.logger.info(`${label} control OFF applied ts=${ts}; LAST_TS cleared`);
  sendReply(deps, label, channel, ts, REPLY_OFF);
};

const applyUnknown = (
  deps: ProcessControlCommandsDeps,
  label: string,
  channel: ChannelId,
  ts: SlackTs,
  rest: string,
): void => {
  deps.logger.info(`${label} control Unknown ts=${ts} rest="${rest}"`);
  sendReply(deps, label, channel, ts, REPLY_UNKNOWN);
};

const processChannel = (
  deps: ProcessControlCommandsDeps,
  channel: ChannelId,
  selfUserId: UserId,
): Result.Result<ChannelControlOutcome, SlackApiError> => {
  const label = `[${channel}]`;
  const cursor = deps.channelControl.getControlCursor(channel);
  if (cursor == null) {
    // 初回はカーソルを「今」で初期化し、過去のメッセージを取り込まないようにする。
    const initial = deps.clock.nowSlackTs();
    deps.channelControl.setControlCursor(channel, initial);
    deps.logger.info(`${label} control: initial cursor set to ${initial}`);
    return Result.succeed({
      channel,
      enabledAfter: deps.channelControl.isEnabled(channel),
      applied: [],
      cursorTo: initial,
    });
  }

  const fetched = deps.slack.getChannelRecentMessages({ channel, oldest: cursor });
  if (Result.isFailure(fetched)) {
    deps.logger.warn(
      `${label} control: conversations.history failed: ${SlackApiError.format(fetched.error)}`,
    );
    return Result.fail(fetched.error);
  }

  const candidates = fetched.value.messages
    .filter(isCandidate)
    .filter((m) => SlackTs.isAfter(m.ts, cursor))
    .slice()
    .sort((a, b) => SlackTs.compareAsc(a.ts, b.ts));

  const state = { enabled: deps.channelControl.isEnabled(channel) };
  const applied: Array<{ ts: SlackTs; kind: ControlCommand['kind'] }> = [];
  let cursorTo = cursor;

  for (const message of candidates) {
    const command = ControlCommand.parse(message.text, selfUserId);
    switch (command.kind) {
      case 'NotForUs':
        break;
      case 'On':
        applyOn(deps, label, channel, message.ts, state);
        applied.push({ ts: message.ts, kind: 'On' });
        break;
      case 'Off':
        applyOff(deps, label, channel, message.ts, state);
        applied.push({ ts: message.ts, kind: 'Off' });
        break;
      case 'Unknown':
        applyUnknown(deps, label, channel, message.ts, command.rest);
        applied.push({ ts: message.ts, kind: 'Unknown' });
        break;
      default:
        assertNever(command);
    }
    cursorTo = SlackTs.max(cursorTo, message.ts);
  }

  if (cursorTo !== cursor) {
    deps.channelControl.setControlCursor(channel, cursorTo);
  }

  return Result.succeed({
    channel,
    enabledAfter: state.enabled,
    applied,
    cursorTo,
  });
};

export const processControlCommands = (deps: ProcessControlCommandsDeps) =>
(
  channels: ReadonlyArray<ChannelId>,
  selfUserId: UserId | undefined,
): ReadonlyArray<ChannelControlOutcome> => {
  if (selfUserId == null) {
    deps.logger.warn(
      'SELF_USER_ID is not configured. Skipping on/off mention processing.',
    );
    return [];
  }
  return channels.map((channel) => {
    const res = processChannel(deps, channel, selfUserId);
    if (Result.isFailure(res)) {
      return {
        channel,
        enabledAfter: deps.channelControl.isEnabled(channel),
        applied: [],
        cursorTo: deps.channelControl.getControlCursor(channel) ?? deps.clock.nowSlackTs(),
      };
    }
    return res.value;
  });
};
