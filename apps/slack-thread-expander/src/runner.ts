import type { Result } from '@iwasa-kosui/result';
import { err, ok } from '@iwasa-kosui/result';

import { getLastTs, nowAsSlackTs, setLastTs } from './config.ts';
import { findThreadedReply, isOwnPost } from './domain/threaded-reply.ts';
import { chatGetPermalink, chatPostMessage } from './slack/chat.ts';
import type { SlackApiError, SlackClient } from './slack/client.ts';
import { conversationsHistory } from './slack/conversations.ts';

export type ExpandSummary = {
  channel: string;
  fetched: number;
  expanded: number;
  errors: SlackApiError[];
};

export const expandChannel = (
  client: SlackClient,
  channel: string,
  selfBotId: string | undefined,
): ExpandSummary => {
  const lastTs = getLastTs(channel);
  if (lastTs == null) {
    const initial = nowAsSlackTs();
    setLastTs(channel, initial);
    console.log(
      `[${channel}] initial run; set last_ts=${initial} and skip this tick`,
    );
    return { channel, fetched: 0, expanded: 0, errors: [] };
  }

  const historyRes = conversationsHistory(client, {
    channel,
    oldest: lastTs,
  });
  if (!historyRes.ok) {
    console.warn(
      `[${channel}] conversations.history failed: ${
        JSON.stringify(
          historyRes.err,
        )
      }`,
    );
    return { channel, fetched: 0, expanded: 0, errors: [historyRes.err] };
  }

  const messages = historyRes.val.messages ?? [];
  // conversations.history は新しい順に返るので、ts 昇順に処理する。
  const sorted = [...messages].sort((a, b) => (a.ts < b.ts ? -1 : 1));

  const errors: SlackApiError[] = [];
  let expanded = 0;
  let maxTs = lastTs;

  for (const message of sorted) {
    const updateCursor = () => {
      if (message.ts > maxTs) {
        maxTs = message.ts;
        setLastTs(channel, maxTs);
      }
    };

    if (isOwnPost(message, selfBotId)) {
      updateCursor();
      continue;
    }
    const ref = findThreadedReply(channel, message);
    if (ref == null) {
      updateCursor();
      continue;
    }

    const result = postPermalink(client, ref.channel, ref.ts);
    if (!result.ok) {
      console.warn(
        `[${channel}] failed to expand ts=${ref.ts}: ${
          JSON.stringify(
            result.err,
          )
        }`,
      );
      errors.push(result.err);
      // 失敗した瞬間に next tick で再試行できるよう、ここで break して
      // カーソルを進めない。
      break;
    }
    expanded += 1;
    updateCursor();
  }

  return { channel, fetched: messages.length, expanded, errors };
};

const postPermalink = (
  client: SlackClient,
  channel: string,
  messageTs: string,
): Result<void, SlackApiError> => {
  const permalinkRes = chatGetPermalink(client, { channel, messageTs });
  if (!permalinkRes.ok) return permalinkRes;
  const permalink = permalinkRes.val.permalink;
  if (!permalink) {
    return err({ kind: 'slack', error: 'missing_permalink' });
  }
  const postRes = chatPostMessage(client, { channel, text: permalink });
  if (!postRes.ok) return postRes;
  console.log(`[${channel}] expanded ${messageTs} -> ${permalink}`);
  return ok(undefined);
};
