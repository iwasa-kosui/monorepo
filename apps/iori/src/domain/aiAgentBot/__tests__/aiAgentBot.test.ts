import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { PostId } from '../../post/postId.ts';
import { AiAgentBot } from '../aiAgentBot.ts';

describe('AiAgentBot.isBotUsername', () => {
  it('もう動かさない以前の bot のアカウントも、bot として扱い続ける', () => {
    expect(AiAgentBot.isBotUsername('iori_bot')).toBe(true);
  });
});

describe('AiAgentBot.isRepeatOf', () => {
  const previous = '分散型SNSの良さは、自分のデータを自分で持てることだと思います。みなさんはどう考えますか？';

  it('空白・記号・全角半角だけが違う本文は繰り返しとみなす', () => {
    expect(
      AiAgentBot.isRepeatOf(
        '分散型ＳＮＳの良さは 自分のデータを自分で持てることだと思います! みなさんはどう考えますか',
        [previous],
      ),
    )
      .toBe(true);
  });

  it('少し言い換えただけの本文は繰り返しとみなす', () => {
    expect(
      AiAgentBot.isRepeatOf('分散型SNSの良さは、自分のデータを自分で持てることだと思います。皆さんはどう考えますか？', [
        previous,
      ]),
    )
      .toBe(true);
  });

  it('別の話題の本文は繰り返しとみなさない', () => {
    expect(
      AiAgentBot.isRepeatOf(
        '今日は ActivityPub の Move アクティビティについて調べました。引っ越しの仕組みが面白いです。',
        [previous],
      ),
    )
      .toBe(false);
  });

  it('最近の投稿が無ければ繰り返しとみなさない', () => {
    expect(AiAgentBot.isRepeatOf(previous, [])).toBe(false);
  });
});

describe('AiAgentBot.decideResponse', () => {
  it('bot 自身の投稿には答えない（自分の返信に自分で答え続けない）', () => {
    const botActorId = ActorId.orThrow('0192f6a0-0000-7000-8000-0000000000b0');
    const decision = AiAgentBot.decideResponse({
      trigger: {
        postId: PostId.orThrow('0192f6a0-0000-7000-8000-000000000001'),
        authorActorId: botActorId,
        receivedAt: Instant.orThrow(1_000),
      },
      botActorId,
      authorActorType: undefined,
      botRepliesInThread: 0,
      now: Instant.orThrow(2_000),
    });

    expect(decision).toEqual({ type: 'ignore', reason: 'selfAuthor' });
  });
});
