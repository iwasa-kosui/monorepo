export type DigestPublishNotice = Readonly<{
  digestDate: string;
  excluded: Readonly<{
    timelineLinks: number;
    hatena: number;
    hatenaCounts: boolean;
    recommendations: boolean;
  }>;
}>;

export const buildDigestPublishConfirmMessage = ({ excluded }: DigestPublishNotice): string | undefined => {
  const lines = [
    ...(excluded.timelineLinks > 0 ? [`・みんなの関心（iori のタイムライン）${excluded.timelineLinks} 件`] : []),
    ...(excluded.hatena > 0 ? [`・みんなの関心（はてなブックマーク）${excluded.hatena} 件`] : []),
    ...(excluded.hatenaCounts ? ['・新着のはてなブックマーク数の表示'] : []),
    ...(excluded.recommendations
      ? ['・はてなから見つけたおすすめの記事', '・iori の投稿といいねを根拠にした表示']
      : []),
  ];
  return lines.length === 0 ? undefined : ['公開版では次の項目を除きます。', ...lines, '公開しますか？'].join('\n');
};
