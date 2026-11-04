import { describe, expect, it } from 'vitest';

import { buildDigestPublishConfirmMessage } from './digestPublishConfirm.ts';

const notice = (excluded: {
  timelineLinks: number;
  hatena: number;
  hatenaCounts: boolean;
  recommendations?: boolean;
}) => ({
  digestDate: '2026-11-05',
  excluded: { recommendations: false, ...excluded },
});

describe('buildDigestPublishConfirmMessage', () => {
  it('除く項目をすべて並べる', () => {
    expect(
      buildDigestPublishConfirmMessage(
        notice({ timelineLinks: 3, hatena: 2, hatenaCounts: true, recommendations: true }),
      ),
    ).toBe(
      [
        '公開版では次の項目を除きます。',
        '・みんなの関心（iori のタイムライン）3 件',
        '・みんなの関心（はてなブックマーク）2 件',
        '・新着のはてなブックマーク数の表示',
        '・はてなから見つけたおすすめの記事',
        '・iori の投稿といいねを根拠にした表示',
        '公開しますか？',
      ].join('\n'),
    );
  });

  it('件数が 0 の項目は出さない', () => {
    const message = buildDigestPublishConfirmMessage(notice({ timelineLinks: 0, hatena: 2, hatenaCounts: false }));

    expect(message).toContain('みんなの関心（はてなブックマーク）2 件');
    expect(message).not.toContain('iori のタイムライン');
    expect(message).not.toContain('はてなブックマーク数の表示');
    expect(message).not.toContain('おすすめ');
    expect(message).not.toContain('iori の投稿といいね');
  });

  it('除く項目がなければ確認の文面を返さない', () => {
    expect(buildDigestPublishConfirmMessage(notice({ timelineLinks: 0, hatena: 0, hatenaCounts: false })))
      .toBeUndefined();
  });
});
