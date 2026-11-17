import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { PostId } from '../../post/postId.ts';
import { AiAgentBot, MAX_BOT_POST_CHARACTERS, MUSING_INTERVAL_MS } from '../aiAgentBot.ts';

describe('AiAgentBot.username', () => {
  it('is a valid Fediverse username', () => {
    expect(AiAgentBot.username).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('is not one of the retired usernames, so the new bot is never deleted', () => {
    expect(AiAgentBot.isRetiredUsername(AiAgentBot.username)).toBe(false);
  });
});

describe('AiAgentBot.decideMusingTheme', () => {
  const slot = (n: number) => Instant.orThrow(n * MUSING_INTERVAL_MS);
  const all = { hasPopularArticles: true, hasBlueskyTopics: true };

  it('rotates the theme every musing interval so the same kind of post does not continue', () => {
    const themes = [0, 1, 2, 3].map((n) => AiAgentBot.decideMusingTheme({ now: slot(n), ...all }));
    expect(new Set(themes.slice(0, 3)).size).toBe(3);
    expect(themes[3]).toBe(themes[0]);
  });

  it('falls back to the timeline when there is no material for the chosen theme', () => {
    const none = { hasPopularArticles: false, hasBlueskyTopics: false };
    const themes = [0, 1, 2].map((n) => AiAgentBot.decideMusingTheme({ now: slot(n), ...none }));
    expect(themes).toEqual(['timeline', 'timeline', 'timeline']);
  });
});

describe('AiAgentBot.normalizePostText', () => {
  it.each([
    ['@kosui さん、こんにちは', 'さん、こんにちは'],
    ['@kosui@mastodon.social こんにちは', 'こんにちは'],
    ['[@kosui](https://mastodon.social/@kosui) さん、こんにちは', 'さん、こんにちは'],
    ['[@kosui](https://mastodon.social/@kosui)\n本文', '本文'],
  ])('先頭のメンションを取り除く: %s', (raw, expected) => {
    expect(AiAgentBot.normalizePostText(raw)).toBe(expected);
  });

  it('本文の途中のメンションは残す', () => {
    expect(AiAgentBot.normalizePostText('詳しくは @alice に聞いてください')).toBe('詳しくは @alice に聞いてください');
  });

  it('上限以内の本文はそのまま返す', () => {
    const text = `${'あ'.repeat(MAX_BOT_POST_CHARACTERS - 29)}\nhttps://example.com/a/1.html`;
    expect(AiAgentBot.normalizePostText(text)).toBe(text);
  });

  it('上限を超えた本文は、末尾の URL を残して文章を切り詰める', () => {
    const url = 'https://www.example.com/news/articles/2611/16/news001.html';
    const text = AiAgentBot.normalizePostText(`${'あ'.repeat(MAX_BOT_POST_CHARACTERS)}\n${url}`);
    expect(text).toBe(`${'あ'.repeat(MAX_BOT_POST_CHARACTERS - url.length - 2)}…\n${url}`);
    expect([...text!]).toHaveLength(MAX_BOT_POST_CHARACTERS);
  });

  it('末尾に並んだ複数の URL をすべて残す', () => {
    const urls = '\nhttps://example.com/a\nhttps://example.com/b';
    const text = AiAgentBot.normalizePostText(`${'あ'.repeat(MAX_BOT_POST_CHARACTERS)}${urls}`);
    expect(text).toBe(`${'あ'.repeat(MAX_BOT_POST_CHARACTERS - urls.length - 1)}…${urls}`);
  });

  it('切る位置が文中の URL にかかるときは、その URL の手前で切る', () => {
    const head = 'あ'.repeat(MAX_BOT_POST_CHARACTERS - 10);
    const text = AiAgentBot.normalizePostText(`${head} https://example.com/long/path.html ${'い'.repeat(50)}`);
    expect(text).toBe(`${head}…`);
  });

  it('URL のない本文は上限で切り詰める', () => {
    const text = AiAgentBot.normalizePostText('あ'.repeat(MAX_BOT_POST_CHARACTERS + 10));
    expect(text).toBe(`${'あ'.repeat(MAX_BOT_POST_CHARACTERS - 1)}…`);
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
