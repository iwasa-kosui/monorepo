export const pageFlows = {
  problem: '課題',
  explain: '説明',
  try: 'やってみる',
  exercise: '演習',
  demo: '実演',
  recap: 'まとめ',
} as const;

export type PageFlow = keyof typeof pageFlows;

export type LessonMode = 'listen' | 'do';

export type LessonPage = {
  readonly flow: PageFlow;
  readonly mode: LessonMode;
  readonly role: string;
};

export const lessonPages: Readonly<Record<string, LessonPage>> = {
  'intro/01': {
    flow: 'problem',
    mode: 'listen',
    role: '講師が、医療や教育を支えるシステムの設計に関心を持ってほしい理由を話すのを聞きます。',
  },
  'intro/02': {
    flow: 'try',
    mode: 'do',
    role:
      'カスタマーサポートから届いた連絡に対応して、DB コンソール、ログの検索、リポジトリで、キャンセルの理由を調べます。',
  },
  'intro/03': {
    flow: 'problem',
    mode: 'listen',
    role: '講師が、医療のシステムに求められる品質と、記録に助けられた経験を話すのを聞きます。',
  },
  'intro/04': {
    flow: 'problem',
    mode: 'listen',
    role: '講師が、イベントソーシングの見られ方と、段階的に適用する考え方を話すのを聞きます。',
  },
  'intro/05': {
    flow: 'problem',
    mode: 'listen',
    role: '講師が、このハンズオンの目的を話すのを聞きます。',
  },
  'intro/06': {
    flow: 'try',
    mode: 'do',
    role: 'アクセスログとDBバックアップで、ポチのキャンセルを調べます。',
  },
  'intro/07': {
    flow: 'problem',
    mode: 'listen',
    role: '講師が、コードを見ない開発の時代の品質保証を話すのを聞きます。',
  },
  'chapter-1/01': {
    flow: 'problem',
    mode: 'do',
    role: '自分のシステムで、DB を見ても分からなかったことを1つ書きます。',
  },
  'chapter-1/02': {
    flow: 'try',
    mode: 'do',
    role: 'エディタでテストを実行し、第2章で書くコードがまだ無いために4件が失敗することを確かめます。',
  },
  'chapter-2/01': {
    flow: 'explain',
    mode: 'listen',
    role:
      'ADR（設計上の決定を残す文書）で、キャンセルした人と理由を、来院の更新と同じトランザクションで `visit_cancellations` に追記する方針を読みます。',
  },
  'chapter-2/02': {
    flow: 'exercise',
    mode: 'do',
    role: 'エディタで `cancelVisit` の空欄を埋めて、来院のキャンセルを `visit_cancellations` に記録します。',
  },
  'chapter-2/03': {
    flow: 'explain',
    mode: 'listen',
    role: 'ADR で、出来事の記録を1つのテーブルにまとめる理由と、`business_events` の各列を残す理由を読みます。',
  },
  'chapter-2/04': {
    flow: 'exercise',
    mode: 'do',
    role: 'エディタで `cancelVisit` の `INSERT` を書き換えて、来院のキャンセルを業務イベントとして記録します。',
  },
  'chapter-2/05': {
    flow: 'explain',
    mode: 'listen',
    role:
      'プルリクエストで、記録を足すと `visits.ts` が何行変わるかと、足した後も残る作業と、記録されない変更を読みます。',
  },
  'chapter-3/01': {
    flow: 'try',
    mode: 'do',
    role: 'DB コンソールで `visits` と業務イベントを結びつける SQL を実行し、結果から問い合わせに返信します。',
  },
  'chapter-3/02': {
    flow: 'explain',
    mode: 'listen',
    role: '文書で、`who-cancelled.ts` が `visits` と `business_events` を来院の ID で結びつける SELECT を読みます。',
  },
  'chapter-3/03': {
    flow: 'try',
    mode: 'listen',
    role: '文書の表から、`visit-pochi` の問い合わせに誰が、いつ、何を、なぜで答えます。',
  },
  'chapter-3/04': {
    flow: 'problem',
    mode: 'do',
    role:
      '記録を足す前にキャンセルされた `visit-tama` の問い合わせには、今も答えられないことを図で確かめて返信します。',
  },
  'chapter-4/01': {
    flow: 'explain',
    mode: 'listen',
    role:
      '文書の「相談の一覧」で、ほかのチームから届いた3つの相談と、3つのパターンの実演を見た後に判断表で1つ選ぶというこの章の進め方を読みます。',
  },
  'chapter-4/02': {
    flow: 'demo',
    mode: 'do',
    role:
      '経理からの質問について、集計テーブルの値と業務イベントから再計算した値の差を、エディタの完成コードと DB コンソールの SQL で確かめて返信します。',
  },
  'chapter-4/03': {
    flow: 'demo',
    mode: 'do',
    role:
      'カスタマーサポートからの質問について、外部へいつ何を送ったかを業務イベントに残す方法を、エディタの完成コードと DB コンソールの SQL で確かめて返信します。',
  },
  'chapter-4/04': {
    flow: 'demo',
    mode: 'do',
    role:
      '情シスからの質問について、監査ログと業務イベントの役割を分ける方法を、エディタの完成コードと DB コンソールの SQL で確かめて返信します。',
  },
  'chapter-4/05': {
    flow: 'try',
    mode: 'do',
    role: '文書の比較表で、3つのパターンを同じ軸で比べ、第1章で挙げた問いに近いパターンを1つ選びます。',
  },
  'chapter-4/06': {
    flow: 'recap',
    mode: 'listen',
    role:
      '文書で、選んだパターンをエディタの開始コードから、テストがすべて成功するまで自分で実装する持ち帰りの手順を読みます。',
  },
  'summary/01': {
    flow: 'recap',
    mode: 'listen',
    role: '文書で、本日の実施内容と、イベントソーシングのうち今日使った考え方と使わなかったことを振り返ります。',
  },
  'summary/02': {
    flow: 'recap',
    mode: 'do',
    role:
      'チャットの入力欄に、自分のシステムで記録を足す更新処理を1つ書き、文書で持ち帰りの教材と、当日に演習を実施できなかったときの進め方を確かめます。',
  },
};

export const lessonPageOf = (id: string): LessonPage => {
  const page = lessonPages[id];
  if (page === undefined) {
    throw new Error(`lesson-pages.ts にページがありません: ${id}`);
  }
  return page;
};
