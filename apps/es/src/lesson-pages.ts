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
    role: 'ミッションクリティカルな領域において求められる品質',
  },
  'intro/02': {
    flow: 'try',
    mode: 'do',
    role:
      'カスタマーサポートから届いた連絡に対応して、DB コンソール、ログの検索、リポジトリで、キャンセルの理由を調べる',
  },
  'intro/03': {
    flow: 'problem',
    mode: 'listen',
    role: '求められる品質',
  },
  'intro/04': {
    flow: 'explain',
    mode: 'listen',
    role: 'イベントソーシング',
  },
  'intro/05': {
    flow: 'problem',
    mode: 'listen',
    role: 'イベントソーシングが敬遠される理由',
  },
  'intro/06': {
    flow: 'problem',
    mode: 'listen',
    role: '段階的な適用とこのハンズオンの目的',
  },
  'intro/07': {
    flow: 'problem',
    mode: 'listen',
    role: 'コードを見ない開発と品質の保証',
  },
  'chapter-1/01': {
    flow: 'try',
    mode: 'do',
    role: 'アクセスログとDBバックアップで、3ヶ月前のポチの受付を調べる',
  },
  'chapter-1/02': {
    flow: 'problem',
    mode: 'do',
    role: '普段の業務で運用しているシステムについて聞かれて、DB を見ても分からなかった質問を1つ書いて送る',
  },
  'chapter-1/03': {
    flow: 'try',
    mode: 'do',
    role: 'エディタでテストを実行し、第2章で書くコードがまだ無いために4件が失敗することを確かめる',
  },
  'chapter-2/01': {
    flow: 'explain',
    mode: 'listen',
    role: 'ADR（設計上の決定を残す文書）に同僚が並べた案から、自分ならどの案を選ぶかを決め、その後で同僚の決定と比べる',
  },
  'chapter-2/02': {
    flow: 'exercise',
    mode: 'do',
    role: 'エディタで `cancelVisit` の空欄を埋めて、来院のキャンセルを `visit_cancellations` に記録する',
  },
  'chapter-2/03': {
    flow: 'explain',
    mode: 'listen',
    role: 'ADR で、出来事の記録を1つのテーブルにまとめる理由と、`business_events` の各列を残す理由を読む',
  },
  'chapter-2/04': {
    flow: 'exercise',
    mode: 'do',
    role: 'エディタで `cancelVisit` の `INSERT` を書き換えて、来院のキャンセルを業務イベントとして記録する',
  },
  'chapter-2/05': {
    flow: 'explain',
    mode: 'listen',
    role: 'プルリクエストで、記録を足すと `visits.ts` が何行変わるかと、足した後も残る作業と、記録されない変更を読む',
  },
  'chapter-3/01': {
    flow: 'try',
    mode: 'do',
    role:
      'DB コンソールで `visits` と業務イベントを結びつける SQL を実行し、結果の表から根拠にする行を選択して、問い合わせに返信する',
  },
  'chapter-3/02': {
    flow: 'explain',
    mode: 'listen',
    role: '文書で、`who-cancelled.ts` が `visits` と `business_events` を来院の ID で結びつける SELECT を読む',
  },
  'chapter-3/03': {
    flow: 'try',
    mode: 'listen',
    role: '文書の表から、`visit-pochi` の問い合わせに誰が、いつ、何を、なぜで答える',
  },
  'chapter-3/04': {
    flow: 'problem',
    mode: 'do',
    role:
      'DB コンソールの結果の表から `visit-tama` の行を選択して返信し、記録を足す前にキャンセルされた来院には今も答えられないことを図で確かめる',
  },
  'chapter-4/01': {
    flow: 'explain',
    mode: 'listen',
    role: '経理からの問い合わせの内容と、いまのデータでは回答できない点を、文書の図で読む',
  },
  'chapter-4/02': {
    flow: 'demo',
    mode: 'do',
    role:
      '経理からの質問について、集計テーブルの値と業務イベントから再計算した値の差を、エディタの完成コードと DB コンソールの SQL で確かめて返信する',
  },
  'chapter-4/03': {
    flow: 'explain',
    mode: 'listen',
    role: '同僚が書いた ADR 3 を読み、業務イベントを導入する前のデータの扱いを確認する',
  },
  'chapter-4/04': {
    flow: 'explain',
    mode: 'listen',
    role: 'カスタマーサポートからの問い合わせの内容と、いまのデータでは回答できない点を、文書の図で読む',
  },
  'chapter-4/05': {
    flow: 'demo',
    mode: 'do',
    role:
      'カスタマーサポートからの質問について、予約サイトから届いたキャンセルと取り込んだ結果を業務イベントに残す方法を、エディタの完成コードと DB コンソールの SQL で確かめて返信する',
  },
  'chapter-4/06': {
    flow: 'explain',
    mode: 'listen',
    role: '同僚が書いた ADR 4 を読み、予約サイトから届いたキャンセルの記録の方法を確認する',
  },
  'chapter-4/07': {
    flow: 'explain',
    mode: 'listen',
    role: '情シスからの問い合わせの内容と、いまのデータでは回答できない点を、文書の図で読む',
  },
  'chapter-4/08': {
    flow: 'demo',
    mode: 'do',
    role:
      '情シスからの質問について、監査ログで足りる領域と、イベントで残す領域を分ける方法を、エディタの完成コードと DB コンソールの SQL で確かめて返信する',
  },
  'chapter-4/09': {
    flow: 'explain',
    mode: 'listen',
    role: '同僚が書いた ADR 5 を読み、監査ログと業務イベントの役割の分け方を確認する',
  },
  'chapter-4/10': {
    flow: 'try',
    mode: 'do',
    role: '文書の比較表で、3つのパターンを同じ軸で比べ、普段の業務で運用しているシステムに近いパターンを1つ選ぶ',
  },
  'chapter-4/11': {
    flow: 'recap',
    mode: 'listen',
    role:
      '文書で、選んだパターンをエディタの開始コードから、テストがすべて成功するまで自分で実装する持ち帰りの手順を読む',
  },
  'summary/01': {
    flow: 'recap',
    mode: 'listen',
    role: '文書で、本日の実施内容と、イベントソーシングのうち今日使った考え方と使わなかったことを振り返る',
  },
  'summary/02': {
    flow: 'recap',
    mode: 'do',
    role:
      'チャットの入力欄に、普段の業務で運用しているシステムで記録を足す更新処理を1つ書いて送り、文書で持ち帰りの教材と、当日に演習を実施できなかったときの進め方を確かめる',
  },
};

export const lessonPageOf = (id: string): LessonPage => {
  const page = lessonPages[id];
  if (page === undefined) {
    throw new Error(`lesson-pages.ts にページがありません: ${id}`);
  }
  return page;
};
