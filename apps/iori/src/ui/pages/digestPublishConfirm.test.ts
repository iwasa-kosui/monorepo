import { describe, expect, it } from 'vitest';

import { buildDigestPublishConfirmMessage } from './digestPublishConfirm.ts';

const notice = (
  excluded: {
    timelineLinks: number;
    hatena: number;
    hatenaCounts: boolean;
    recommendations?: boolean;
  },
  edited = false,
  topicKey = 'genai',
  items: ReadonlyArray<unknown> = topicKey === 'summary' ? [] : [{}],
) => ({
  digestDate: '2026-11-05',
  topicKey,
  items,
  edited,
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

  it('編集済みなら除く項目を並べず、編集した本文をそのまま公開すると伝える', () => {
    expect(
      buildDigestPublishConfirmMessage(
        notice({ timelineLinks: 3, hatena: 2, hatenaCounts: true, recommendations: true }, true),
      ),
    ).toBe(['編集した本文をそのまま公開します。', '公開しますか？'].join('\n'));
  });

  it('編集済みなら除く項目が 0 件でも確認の文面を返す', () => {
    expect(buildDigestPublishConfirmMessage(notice({ timelineLinks: 0, hatena: 0, hatenaCounts: false }, true)))
      .toBe(['編集した本文をそのまま公開します。', '公開しますか？'].join('\n'));
  });

  it('除く項目がなければ確認の文面を返さない', () => {
    expect(buildDigestPublishConfirmMessage(notice({ timelineLinks: 0, hatena: 0, hatenaCounts: false })))
      .toBeUndefined();
  });

  it('旧形式のまとめ（項目を持つ）には、公開を想定していない旨を出さない', () => {
    expect(
      buildDigestPublishConfirmMessage(
        notice({ timelineLinks: 3, hatena: 0, hatenaCounts: true }, false, 'summary', [{}]),
      ),
    ).toBe(
      [
        '公開版では次の項目を除きます。',
        '・みんなの関心（iori のタイムライン）3 件',
        '・新着のはてなブックマーク数の表示',
        '公開しますか？',
      ].join('\n'),
    );
    expect(
      buildDigestPublishConfirmMessage(
        notice({ timelineLinks: 0, hatena: 0, hatenaCounts: false }, false, 'summary', [{}]),
      ),
    ).toBeUndefined();
  });

  it('まとめなら、除く項目がなくても公開を想定していない旨と確認の文面を返す', () => {
    expect(
      buildDigestPublishConfirmMessage(notice({ timelineLinks: 0, hatena: 0, hatenaCounts: false }, false, 'summary')),
    ).toBe(['この記事は公開を想定していません。', '公開しますか？'].join('\n'));
  });

  it('まとめなら、除く項目の前に公開を想定していない旨を出す', () => {
    expect(
      buildDigestPublishConfirmMessage(notice({ timelineLinks: 3, hatena: 0, hatenaCounts: false }, false, 'summary')),
    ).toBe(
      [
        'この記事は公開を想定していません。',
        '公開版では次の項目を除きます。',
        '・みんなの関心（iori のタイムライン）3 件',
        '公開しますか？',
      ].join('\n'),
    );
  });

  it('まとめなら、編集済みの文面より前に公開を想定していない旨を出す', () => {
    expect(
      buildDigestPublishConfirmMessage(notice({ timelineLinks: 3, hatena: 0, hatenaCounts: false }, true, 'summary')),
    ).toBe(
      ['この記事は公開を想定していません。', '編集した本文をそのまま公開します。', '公開しますか？'].join('\n'),
    );
  });
});
