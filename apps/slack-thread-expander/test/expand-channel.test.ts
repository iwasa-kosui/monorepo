import { err, ok } from '@iwasa-kosui/result';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BotId } from '../src/domain/bot-id.ts';
import { ChannelId } from '../src/domain/channel-id.ts';
import type { ClockPort } from '../src/domain/clock-port.ts';
import type { CursorPort } from '../src/domain/cursor-port.ts';
import type { LoggerPort } from '../src/domain/logger-port.ts';
import { Permalink } from '../src/domain/permalink.ts';
import type { SlackMessage } from '../src/domain/slack-message.ts';
import type { SlackPort } from '../src/domain/slack-port.ts';
import { SlackTs } from '../src/domain/slack-ts.ts';
import { expandChannel } from '../src/usecase/expand-channel.ts';

const channel = ChannelId.schema.parse('C0');
const otherChannel = ChannelId.schema.parse('C1');

const ts = (s: string) => SlackTs.schema.parse(s);
const permalink = Permalink.schema.parse('https://example.slack.com/archives/C0/p1');

const buildMessage = (overrides: Partial<SlackMessage>): SlackMessage => ({
  channel,
  ts: ts('1700000000.000100'),
  threadTs: ts('1699999999.000000'),
  subtype: undefined,
  userId: undefined,
  botId: undefined,
  permalink,
  text: undefined,
  ...overrides,
});

type Mocks = Readonly<{
  slack: SlackPort;
  cursor: CursorPort;
  clock: ClockPort;
  logger: LoggerPort;
  postMessage: ReturnType<typeof vi.fn>;
  setCursor: ReturnType<typeof vi.fn>;
}>;

const buildMocks = (
  options: {
    lastTs?: string;
    channelName?: string;
    matches?: ReadonlyArray<SlackMessage>;
  } = {},
): Mocks => {
  const setCursor = vi.fn();
  const postMessage = vi.fn().mockReturnValue(ok(undefined));
  const cursor: CursorPort = {
    get: () => (options.lastTs ? ts(options.lastTs) : undefined),
    set: setCursor,
  };
  const slack: SlackPort = {
    getChannelName: () => ok(options.channelName ?? 'general'),
    searchMessages: () => ok({ matches: options.matches ?? [], apiTotal: undefined }),
    postMessage,
  };
  const clock: ClockPort = {
    nowMs: () => 0,
    nowSlackTs: () => ts('1700000000.000000'),
  };
  const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { slack, cursor, clock, logger, postMessage, setCursor };
};

describe('expandChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cursor 未設定なら Initialized を返し last_ts を保存する', () => {
    const mocks = buildMocks();
    const outcome = expandChannel(mocks)(channel, undefined);
    expect(outcome.kind).toBe('Initialized');
    expect(mocks.setCursor).toHaveBeenCalledOnce();
  });

  it('ThreadedReply は postMessage を呼んで cursor を進める', () => {
    const newer = buildMessage({ ts: ts('1700000100.000000') });
    const mocks = buildMocks({
      lastTs: '1700000000.000000',
      matches: [newer],
    });
    const outcome = expandChannel(mocks)(channel, undefined);
    expect(outcome.kind).toBe('Processed');
    if (outcome.kind === 'Processed') {
      expect(outcome.expanded).toBe(1);
      expect(outcome.cursorTo).toBe('1700000100.000000');
    }
    expect(mocks.postMessage).toHaveBeenCalledWith({ channel, text: permalink });
  });

  it('selfBotId と一致する bot_id を持つメッセージは skippedOwn としてカウントし post しない', () => {
    const selfBotId = BotId.schema.parse('B0SELF');
    const ownPost = buildMessage({
      ts: ts('1700000100.000000'),
      botId: selfBotId,
    });
    const mocks = buildMocks({
      lastTs: '1700000000.000000',
      matches: [ownPost],
    });
    const outcome = expandChannel(mocks)(channel, selfBotId);
    expect(outcome.kind).toBe('Processed');
    if (outcome.kind === 'Processed') {
      expect(outcome.skippedOwn).toBe(1);
      expect(outcome.expanded).toBe(0);
    }
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it('別チャンネルのマッチは弾く', () => {
    const elsewhere = buildMessage({
      channel: otherChannel,
      ts: ts('1700000100.000000'),
    });
    const mocks = buildMocks({
      lastTs: '1700000000.000000',
      matches: [elsewhere],
    });
    const outcome = expandChannel(mocks)(channel, undefined);
    expect(outcome.kind).toBe('Processed');
    if (outcome.kind === 'Processed') {
      expect(outcome.fetched).toBe(0);
      expect(outcome.candidates).toBe(0);
    }
  });

  it('postMessage 失敗時は cursor を進めず打ち切る', () => {
    const a = buildMessage({ ts: ts('1700000100.000000') });
    const b = buildMessage({ ts: ts('1700000200.000000') });
    const mocks = buildMocks({
      lastTs: '1700000000.000000',
      matches: [a, b],
    });
    mocks.postMessage.mockReturnValueOnce(err({ kind: 'slack', error: 'rate_limited' }));
    const outcome = expandChannel(mocks)(channel, undefined);
    expect(outcome.kind).toBe('Processed');
    if (outcome.kind === 'Processed') {
      expect(outcome.errors.length).toBe(1);
      expect(outcome.expanded).toBe(0);
      expect(outcome.cursorTo).toBe('1700000000.000000');
    }
    expect(mocks.postMessage).toHaveBeenCalledOnce();
  });
});
