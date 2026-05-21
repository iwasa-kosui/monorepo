import { Result } from '@praha/byethrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BotId } from '../src/domain/bot-id.ts';
import { ChannelId } from '../src/domain/channel-id.ts';
import type { LoggerPort } from '../src/domain/logger-port.ts';
import type { SlackPort } from '../src/domain/slack-port.ts';
import { SlackTs } from '../src/domain/slack-ts.ts';
import { cleanupChannel } from '../src/usecase/cleanup-channel.ts';

const channel = ChannelId.schema.parse('C0');
const selfBotId = BotId.schema.parse('B0SELF');
const ts = (s: string) => SlackTs.schema.parse(s);

type Mocks = Readonly<{
  slack: SlackPort;
  logger: LoggerPort;
  deleteMessage: ReturnType<typeof vi.fn>;
  listChannelBotMessages: ReturnType<typeof vi.fn>;
}>;

const buildMocks = (
  options: {
    targets?: ReadonlyArray<string>;
    truncated?: boolean;
    listError?: boolean;
    deleteFailureFor?: ReadonlyArray<string>;
  } = {},
): Mocks => {
  const targets = (options.targets ?? []).map(ts);
  const listChannelBotMessages = vi.fn().mockReturnValue(
    options.listError === true
      ? Result.fail({ kind: 'slack', error: 'channel_not_found' })
      : Result.succeed({ ts: targets, truncated: options.truncated ?? false }),
  );
  const deleteFailureFor = new Set(options.deleteFailureFor ?? []);
  const deleteMessage = vi.fn((input: { ts: string }) =>
    deleteFailureFor.has(input.ts)
      ? Result.fail({ kind: 'slack', error: 'cant_delete_message' })
      : Result.succeed(undefined)
  );
  const slack: SlackPort = {
    getChannelName: vi.fn(),
    searchMessages: vi.fn(),
    getChannelTopLevelTs: vi.fn(),
    postMessage: vi.fn(),
    listChannelBotMessages,
    deleteMessage,
  };
  const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { slack, logger, deleteMessage, listChannelBotMessages };
};

describe('cleanupChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SELF_BOT_ID 未設定なら SkippedMissingSelfBotId を返し削除しない', () => {
    const mocks = buildMocks();
    const outcome = cleanupChannel(mocks)(channel, undefined);
    expect(outcome.kind).toBe('SkippedMissingSelfBotId');
    expect(mocks.listChannelBotMessages).not.toHaveBeenCalled();
    expect(mocks.deleteMessage).not.toHaveBeenCalled();
  });

  it('listChannelBotMessages 失敗時は ListFailed を返し削除しない', () => {
    const mocks = buildMocks({ listError: true });
    const outcome = cleanupChannel(mocks)(channel, selfBotId);
    expect(outcome.kind).toBe('ListFailed');
    expect(mocks.deleteMessage).not.toHaveBeenCalled();
  });

  it('該当する全 ts に対して deleteMessage を呼び、Processed を返す', () => {
    const mocks = buildMocks({ targets: ['1.0', '2.0', '3.0'] });
    const outcome = cleanupChannel(mocks)(channel, selfBotId);
    expect(outcome.kind).toBe('Processed');
    if (outcome.kind === 'Processed') {
      expect(outcome.scanned).toBe(3);
      expect(outcome.deleted).toBe(3);
      expect(outcome.failures).toHaveLength(0);
      expect(outcome.truncated).toBe(false);
    }
    expect(mocks.deleteMessage).toHaveBeenCalledTimes(3);
    expect(mocks.deleteMessage).toHaveBeenCalledWith({ channel, ts: '1.0' });
  });

  it('削除失敗があっても残りは継続し failures に集める', () => {
    const mocks = buildMocks({
      targets: ['1.0', '2.0', '3.0'],
      deleteFailureFor: ['2.0'],
    });
    const outcome = cleanupChannel(mocks)(channel, selfBotId);
    expect(outcome.kind).toBe('Processed');
    if (outcome.kind === 'Processed') {
      expect(outcome.deleted).toBe(2);
      expect(outcome.failures).toHaveLength(1);
      expect(outcome.failures[0]?.ts).toBe('2.0');
    }
    expect(mocks.deleteMessage).toHaveBeenCalledTimes(3);
  });

  it('truncated=true は outcome に反映される', () => {
    const mocks = buildMocks({ targets: ['1.0'], truncated: true });
    const outcome = cleanupChannel(mocks)(channel, selfBotId);
    if (outcome.kind === 'Processed') {
      expect(outcome.truncated).toBe(true);
    }
  });
});
