import { SUMMARY_DIGEST_TOPIC_KEY } from '../../domain/digest/digest.ts';

export type DigestPublishNotice = Readonly<{
  digestDate: string;
  topicKey: string;
  items: ReadonlyArray<unknown>;
  edited: boolean;
  excluded: Readonly<{
    timelineLinks: number;
    hatena: number;
    hatenaCounts: boolean;
    recommendations: boolean;
  }>;
}>;

const UNPUBLISHABLE_NOTICE = 'この記事は公開を想定していません。';

export const buildDigestPublishConfirmMessage = (notice: DigestPublishNotice): string | undefined => {
  const message = buildExclusionMessage(notice);
  if (notice.topicKey !== SUMMARY_DIGEST_TOPIC_KEY || notice.items.length > 0) return message;
  return [UNPUBLISHABLE_NOTICE, message ?? '公開しますか？'].join('\n');
};

const buildExclusionMessage = ({ edited, excluded }: DigestPublishNotice): string | undefined => {
  if (edited) return ['編集した本文をそのまま公開します。', '公開しますか？'].join('\n');
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
