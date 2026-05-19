import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BotId } from '../src/domain/bot-id.ts';
import { ChannelId } from '../src/domain/channel-id.ts';
import type { ClassifyContext } from '../src/domain/message-classification.ts';
import { MessageClassification } from '../src/domain/message-classification.ts';
import { Permalink } from '../src/domain/permalink.ts';
import type { SlackMessage } from '../src/domain/slack-message.ts';
import { SlackTs } from '../src/domain/slack-ts.ts';
import { UserId } from '../src/domain/user-id.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

const EventSchema = z.object({
  type: z.literal('message'),
  channel: ChannelId.schema,
  ts: SlackTs.schema,
  thread_ts: SlackTs.schema.optional(),
  subtype: z.string().optional(),
  user: UserId.schema.optional(),
  bot_id: BotId.schema.optional(),
  text: z.string().optional(),
});

const dummyPermalink = Permalink.schema.parse(
  'https://example.slack.com/archives/C0/p1',
);

const emptyContext: ClassifyContext = {
  selfBotId: undefined,
  topLevelTs: new Set(),
};

const contextWithTopLevel = (
  ...ts: ReadonlyArray<SlackTs>
): ClassifyContext => ({
  selfBotId: undefined,
  topLevelTs: new Set(ts),
});

const loadMessage = (filename: string): SlackMessage => {
  const raw = readFileSync(join(fixturesDir, filename), 'utf8');
  const envelope = JSON.parse(raw) as { payload: { event: unknown } };
  const event = EventSchema.parse(envelope.payload.event);
  return {
    channel: event.channel,
    ts: event.ts,
    threadTs: event.thread_ts,
    subtype: event.subtype,
    userId: event.user,
    botId: event.bot_id,
    permalink: dummyPermalink,
    text: event.text,
  };
};

describe('MessageClassification.classify', () => {
  it('plain message (no thread_ts) は NotThreaded', () => {
    const message = loadMessage('plain_message.json');
    expect(MessageClassification.classify(message, emptyContext).kind).toBe(
      'NotThreaded',
    );
  });

  it('threaded message は ThreadedReply', () => {
    const message = loadMessage('threaded_message.json');
    const c = MessageClassification.classify(message, emptyContext);
    expect(c.kind).toBe('ThreadedReply');
    if (c.kind === 'ThreadedReply') {
      expect(c.channel).toBe('C03387UAMQR');
      expect(c.ts).toBe('1644939337.956639');
    }
  });

  // 編集イベント (message_changed) は thread_ts が top-level に無いため NotThreaded 扱い。
  // 元実装の find_threaded_message も null を返していたためスキップ結果は同等。
  it('edited threaded message (subtype=message_changed) は NotThreaded', () => {
    const message = loadMessage('threaded_message_changed.json');
    expect(MessageClassification.classify(message, emptyContext).kind).toBe(
      'NotThreaded',
    );
  });

  it('broadcasted threaded message (subtype=thread_broadcast) は IgnoredSubtype', () => {
    const message = loadMessage('broadcasted_threaded_message.json');
    const c = MessageClassification.classify(message, emptyContext);
    expect(c.kind).toBe('IgnoredSubtype');
    if (c.kind === 'IgnoredSubtype') expect(c.subtype).toBe('thread_broadcast');
  });

  it('edited broadcasted threaded message は NotThreaded', () => {
    const message = loadMessage('broadcasted_threaded_message_changed.json');
    expect(MessageClassification.classify(message, emptyContext).kind).toBe(
      'NotThreaded',
    );
  });

  it('threaded file upload (subtype=file_share) は ThreadedReply', () => {
    const message = loadMessage('threaded_file_upload.json');
    const c = MessageClassification.classify(message, emptyContext);
    expect(c.kind).toBe('ThreadedReply');
    if (c.kind === 'ThreadedReply') expect(c.ts).toBe('1644940789.277819');
  });

  it('broadcasted threaded file upload は IgnoredSubtype', () => {
    const message = loadMessage('broadcasted_threaded_file_upload.json');
    expect(MessageClassification.classify(message, emptyContext).kind).toBe(
      'IgnoredSubtype',
    );
  });

  it('selfBotId が一致する bot_id を持つメッセージは OwnPost', () => {
    const message = loadMessage('threaded_message.json');
    const selfBotId = BotId.schema.parse('B999OWN');
    const messageWithOwnBotId: SlackMessage = { ...message, botId: selfBotId };
    expect(
      MessageClassification.classify(messageWithOwnBotId, {
        selfBotId,
        topLevelTs: new Set(),
      }).kind,
    ).toBe('OwnPost');
  });

  it('thread_ts === ts は ThreadRoot', () => {
    const channel = ChannelId.schema.parse('C0');
    const ts = SlackTs.schema.parse('1700000000.000100');
    const message: SlackMessage = {
      channel,
      ts,
      threadTs: ts,
      subtype: undefined,
      userId: undefined,
      botId: undefined,
      permalink: dummyPermalink,
      text: undefined,
    };
    expect(MessageClassification.classify(message, emptyContext).kind).toBe(
      'ThreadRoot',
    );
  });

  // search.messages がブロードキャスト投稿の subtype を返さないケース。
  // conversations.history の top-level ts に含まれていれば ThreadBroadcast と判定する。
  it('subtype 欠落でも top-level に存在すれば ThreadBroadcast', () => {
    const channel = ChannelId.schema.parse('C0');
    const ts = SlackTs.schema.parse('1700000100.000000');
    const threadTs = SlackTs.schema.parse('1700000000.000000');
    const message: SlackMessage = {
      channel,
      ts,
      threadTs,
      subtype: undefined,
      userId: undefined,
      botId: undefined,
      permalink: dummyPermalink,
      text: undefined,
    };
    expect(
      MessageClassification.classify(message, contextWithTopLevel(ts)).kind,
    ).toBe('ThreadBroadcast');
  });

  it('top-level に存在しなければ通常の ThreadedReply', () => {
    const channel = ChannelId.schema.parse('C0');
    const ts = SlackTs.schema.parse('1700000100.000000');
    const threadTs = SlackTs.schema.parse('1700000000.000000');
    const otherTs = SlackTs.schema.parse('1700000050.000000');
    const message: SlackMessage = {
      channel,
      ts,
      threadTs,
      subtype: undefined,
      userId: undefined,
      botId: undefined,
      permalink: dummyPermalink,
      text: undefined,
    };
    expect(
      MessageClassification.classify(message, contextWithTopLevel(otherTs)).kind,
    ).toBe('ThreadedReply');
  });
});
