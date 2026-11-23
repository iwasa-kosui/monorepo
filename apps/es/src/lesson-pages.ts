export const pageFlows = {
  problem: '課題',
  explain: '説明',
  try: 'やってみる',
  exercise: '演習',
  demo: '実演',
  recap: 'まとめ',
} as const;

export type PageFlow = keyof typeof pageFlows;

export type LessonPage = {
  readonly flow: PageFlow;
  readonly role: string;
};

export const lessonPages: Readonly<Record<string, LessonPage>> = {
  'intro/01': {
    flow: 'problem',
    role:
      '変更の理由を残していなかったために問い合わせに答えられなかった経験を聞き、捨てたデータは復元できないことを知ります。',
  },
  'intro/02': {
    flow: 'problem',
    role:
      '記録が残っていると障害対応や移行で何ができるかと、このハンズオンの目的と、イベントを記録するだけでも価値があるという考えを聞きます。',
  },
  'intro/03': {
    flow: 'problem',
    role: 'ほかの方法と比べ、今日は更新処理を呼ぶコードに1か所、記録を足すことを知ります。',
  },
  'intro/04': {
    flow: 'problem',
    role: '記録を足しても足す前のことは分からないこと、全面移行ではなく1か所足すことと、今日の題材を知ります。',
  },
  'chapter-1/01': {
    flow: 'try',
    role:
      '`show-visits.ts` を実行し、`visits` テーブルの行からは誰が、いつ、なぜキャンセルしたかを答えられないことを確かめます。',
  },
  'chapter-1/02': {
    flow: 'problem',
    role:
      '開始コードの `cancelVisit` が理由と操作した人を残さないことを読み、自分のシステムで答えられない問いを1つ挙げます。',
  },
  'chapter-1/03': {
    flow: 'try',
    role: 'テストを実行し、第2章で書くコードがまだ無いために4件が失敗することを確かめます。',
  },
  'chapter-2/01': {
    flow: 'explain',
    role: 'キャンセルした人と理由を、来院の更新と同じトランザクションで業務イベントとして記録する方針を読みます。',
  },
  'chapter-2/02': {
    flow: 'try',
    role: '記録が失敗する状態で実行し、来院の更新も取り消されることを確かめます。',
  },
  'chapter-2/03': {
    flow: 'explain',
    role: '`business_events` の各列を残す理由と、誰が、いつ、何を、なぜに答える列を読みます。',
  },
  'chapter-2/04': {
    flow: 'exercise',
    role: '`cancelVisit` の空欄を埋めて、来院のキャンセルを業務イベントとして記録します。',
  },
  'chapter-2/05': {
    flow: 'exercise',
    role: '`cancelVisit` の入力と `payload` を変えて、キャンセルの理由と操作した人も記録します。',
  },
  'chapter-2/06': {
    flow: 'explain',
    role: '記録を足すと `visits.ts` が何行変わるかと、足した後も残る作業と、記録されない変更を読みます。',
  },
  'chapter-3/01': {
    flow: 'try',
    role: '`visits` と業務イベントを結びつける SQL を実行し、結果の表を出します。',
  },
  'chapter-3/02': {
    flow: 'explain',
    role: '`who-cancelled.ts` が `visits` と `business_events` を来院の ID で結びつける SELECT を読みます。',
  },
  'chapter-3/03': {
    flow: 'try',
    role: '実行結果の表から、`visit-pochi` の問い合わせに誰が、いつ、何を、なぜで答えます。',
  },
  'chapter-3/04': {
    flow: 'problem',
    role: '記録を足す前にキャンセルされた `visit-tama` の問い合わせには、今も答えられないことを確かめます。',
  },
  'chapter-4/01': {
    flow: 'explain',
    role: '3つのパターンの実演を見た後に、判断表で1つ選ぶという、この章の進め方を読みます。',
  },
  'chapter-4/02': {
    flow: 'demo',
    role: '集計テーブルのパターンで、集計値と業務イベントから再計算した値の差を見ます。',
  },
  'chapter-4/03': {
    flow: 'demo',
    role: '外部システム同期のパターンで、外部へいつ何を送ったかを業務イベントに残す方法を見ます。',
  },
  'chapter-4/04': {
    flow: 'demo',
    role: '既存の監査ログのパターンで、監査ログと業務イベントの役割を分ける方法を見ます。',
  },
  'chapter-4/05': {
    flow: 'try',
    role: '3つのパターンを判断表で比べ、第1章で挙げた問いに近いパターンを1つ選びます。',
  },
  'chapter-4/06': {
    flow: 'recap',
    role: '選んだパターンを持ち帰り、テストがすべて成功するまで自分で実装する手順を読みます。',
  },
  'summary/01': {
    flow: 'recap',
    role: '今日やったことと、イベントソーシングのうち今日使った考え方と使わなかったことを振り返ります。',
  },
  'summary/02': {
    flow: 'recap',
    role:
      '自分のシステムで記録を足す更新処理を1つ決め、持ち帰りの教材と、当日に手を動かせなかったときの進め方を確かめます。',
  },
};

export const lessonPageOf = (id: string): LessonPage => {
  const page = lessonPages[id];
  if (page === undefined) {
    throw new Error(`lesson-pages.ts にページがありません: ${id}`);
  }
  return page;
};
