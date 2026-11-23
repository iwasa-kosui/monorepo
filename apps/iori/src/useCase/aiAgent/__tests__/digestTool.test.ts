import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { DigestTopicsUnavailableError } from '../../../domain/digest/digest.ts';
import { DigestRequestLimitError } from '../../requestDigest.ts';
import { createDigestTool, type DigestSendFailure, type DigestSent } from '../digestTool.ts';

const toolWith = (result: Result<DigestSent, DigestSendFailure>) => {
  let sent = 0;
  const tool = createDigestTool(async () => {
    sent++;
    return result;
  });
  return { tool, sent: () => sent };
};

describe('send_digest', () => {
  it('送れたら、DM で送ったことと、トピックと項目の数を伝える', async () => {
    const { tool } = toolWith(Result.ok({ topics: 3, items: 12 }));
    const message = await tool.run({});
    expect(message).toContain('DM で送りました');
    expect(message).toContain('3 件');
    expect(message).toContain('12 件');
  });

  it('1 日の上限に達していたら、今日はもう送れないと伝える', async () => {
    const { tool } = toolWith(Result.err(DigestRequestLimitError.create('daily_limit', 3600)));
    expect(await tool.run({})).toBe('エラー: 今日はもうダイジェストを送れません。');
  });

  it('連続の依頼の間隔が短いときは、待ち時間を分に切り上げて伝える', async () => {
    const { tool } = toolWith(Result.err(DigestRequestLimitError.create('too_soon', 61)));
    const message = await tool.run({});
    expect(message).toContain('2 分ほど待って');
    expect(message).toMatch(/^エラー/);
  });

  it('待ち時間が 1 分に満たなくても、0 分とは伝えない', async () => {
    const { tool } = toolWith(Result.err(DigestRequestLimitError.create('too_soon', 5)));
    expect(await tool.run({})).toContain('1 分ほど待って');
  });

  it('トピックが使えないときは、トピックの準備ができていないと伝える', async () => {
    const { tool } = toolWith(Result.err(DigestTopicsUnavailableError.create()));
    expect(await tool.run({})).toBe('エラー: ダイジェストのトピックの準備ができていないため、送れません。');
  });

  it('そのほかの失敗では、送れなかったと伝え、失敗の中身は伝えない', async () => {
    const { tool } = toolWith(Result.err({ type: 'DigestSendFailedError', message: 'secret detail' } as never));
    const message = await tool.run({});
    expect(message).toBe('エラー: ダイジェストを送れませんでした。');
    expect(message).not.toContain('secret detail');
  });

  it('type を持たない失敗でも、送れなかったと伝える', async () => {
    const { tool } = toolWith(Result.err({ kind: 'ParseError', message: 'secret detail' }));
    expect(await tool.run({})).toBe('エラー: ダイジェストを送れませんでした。');
  });

  it('1 回の実行で 2 回目以降は、送らずにエラーを返す', async () => {
    const { tool, sent } = toolWith(Result.ok({ topics: 1, items: 2 }));
    await tool.run({});
    const second = await tool.run({});
    expect(second).toMatch(/^エラー/);
    expect(sent()).toBe(1);
  });

  it('失敗した後でも、同じ実行でもう一度は送らない', async () => {
    const { tool, sent } = toolWith(Result.err(DigestRequestLimitError.create('daily_limit', 3600)));
    await tool.run({});
    await tool.run({});
    expect(sent()).toBe(1);
  });
});
