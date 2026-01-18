import type { NenType } from '../nenType/nenType.ts';

/**
 * 判断軸 - 原作のヒソカによるオーラ別性格分析に基づく
 */
export type TraitAxis =
  | 'simplicity' // 単純さ・一途さ → 強化系
  | 'whimsicality' // 気まぐれ・嘘つき → 変化系
  | 'impulsiveness' // 短気・大雑把 → 放出系
  | 'rationality' // 理屈っぽさ・マイペース → 操作系
  | 'meticulousness' // 神経質・几帳面 → 具現化系
  | 'individualism'; // 個人主義・カリスマ性 → 特質系

export const TRAIT_AXIS_INFO: Record<
  TraitAxis,
  { japaneseName: string; description: string; nenType: NenType }
> = {
  simplicity: {
    japaneseName: '一途さ',
    description: '物事に対してまっすぐに向き合う姿勢',
    nenType: 'enhancement',
  },
  whimsicality: {
    japaneseName: '気まぐれさ',
    description: '自由で型にはまらない性質',
    nenType: 'transmutation',
  },
  impulsiveness: {
    japaneseName: '直情さ',
    description: '感情を素直に表現する傾向',
    nenType: 'emission',
  },
  rationality: {
    japaneseName: '論理性',
    description: '物事を理詰めで考える傾向',
    nenType: 'manipulation',
  },
  meticulousness: {
    japaneseName: '几帳面さ',
    description: '細部にこだわる性質',
    nenType: 'conjuration',
  },
  individualism: {
    japaneseName: '独自性',
    description: '独自の世界観を持つ性質',
    nenType: 'specialization',
  },
};

export type Answer = Readonly<{
  id: string;
  text: string;
  nenType: NenType;
  traitAxis: TraitAxis;
}>;

export type Question = Readonly<{
  id: number;
  /** この質問で測定する特性軸 */
  traitAxis: TraitAxis;
  /** 質問文 */
  text: string;
  /** 選択肢（3-4つ） */
  answers: readonly Answer[];
}>;

/**
 * 質問リスト - 各質問4つの選択肢
 */
export const QUESTIONS: readonly Question[] = [
  // === 質問1: 一途さ ===
  {
    id: 1,
    traitAxis: 'simplicity',
    text: '目標を達成するために最も大切なのは？',
    answers: [
      {
        id: '1a',
        text: '一度決めたら最後まで諦めない意志',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '1b',
        text: '状況に合わせて柔軟にやり方を変えること',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '1c',
        text: '効率的な方法を論理的に考えること',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '1d',
        text: '細部まで計画を練ること',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
    ],
  },
  // === 質問2: 気まぐれさ ===
  {
    id: 2,
    traitAxis: 'whimsicality',
    text: '約束の時間に遅れそうなとき、あなたは？',
    answers: [
      {
        id: '2a',
        text: '正直に「遅れる」と連絡して全力で向かう',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '2b',
        text: '適当な言い訳を考える',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '2c',
        text: 'イライラしつつも「まあいいか」と開き直る',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '2d',
        text: 'そもそも遅刻しないよう余裕を持って出発している',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
    ],
  },
  // === 質問3: 直情さ ===
  {
    id: 3,
    traitAxis: 'impulsiveness',
    text: '友人に裏切られたことが分かったとき、あなたは？',
    answers: [
      {
        id: '3a',
        text: '怒りを抑えられず、その場で問い詰める',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '3b',
        text: '何も知らないふりをして様子を見る',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '3c',
        text: 'なぜ裏切ったのか冷静に理由を分析する',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '3d',
        text: '裏切りも含めて面白い経験だと受け止める',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
    ],
  },
  // === 質問4: 論理性 ===
  {
    id: 4,
    traitAxis: 'rationality',
    text: 'チームで意見が対立したとき、あなたは？',
    answers: [
      {
        id: '4a',
        text: '自分が正しいと思う意見を最後まで主張する',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '4b',
        text: '論理的に双方の意見を比較し最適解を導く',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '4c',
        text: '面倒なので多数決で早く決めてほしい',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '4d',
        text: '第三の案を提案して議論の流れを変える',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
    ],
  },
  // === 質問5: 几帳面さ ===
  {
    id: 5,
    traitAxis: 'meticulousness',
    text: '部屋の片付けについて、あなたのスタンスは？',
    answers: [
      {
        id: '5a',
        text: '散らかっても気にならない',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '5b',
        text: '定位置を決めて必ず元に戻す',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
      {
        id: '5c',
        text: '気分が乗ったときに一気に片付ける',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '5d',
        text: '自分だけのルールがあり他人には理解されない',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
    ],
  },
  // === 質問6: 独自性 ===
  {
    id: 6,
    traitAxis: 'individualism',
    text: '周囲と意見が違うとき、あなたは？',
    answers: [
      {
        id: '6a',
        text: '自分の意見を曲げずに貫く',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
      {
        id: '6b',
        text: '自分が間違っているかもしれないので素直に聞く',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '6c',
        text: '議論して相手を説得しようとする',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '6d',
        text: '表面上は従うが内心は別のことを考えている',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
    ],
  },
  // === 質問7: 一途さ（2問目） ===
  {
    id: 7,
    traitAxis: 'simplicity',
    text: '挫折を経験したとき、あなたの考えは？',
    answers: [
      {
        id: '7a',
        text: '何度でも立ち上がる。諦めたら終わり',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '7b',
        text: '別の道を探せばいい。執着しない',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '7c',
        text: '失敗の原因を徹底的に分析する',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
      {
        id: '7d',
        text: '挫折も自分の人生の一部。運命だと思う',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
    ],
  },
  // === 質問8: 気まぐれさ（2問目） ===
  {
    id: 8,
    traitAxis: 'whimsicality',
    text: '「あなたは嘘つきだ」と言われたら？',
    answers: [
      {
        id: '8a',
        text: '心外だ。嘘はつかない主義',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '8b',
        text: '嘘も方便。状況に応じて使い分けるのは当然',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '8c',
        text: 'そう思うなら思えばいい。気にしない',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '8d',
        text: '真実は一つではない。見方の問題',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
    ],
  },
  // === 質問9: 直情さ（2問目） ===
  {
    id: 9,
    traitAxis: 'impulsiveness',
    text: '相手が30分遅刻してきた。あなたは？',
    answers: [
      {
        id: '9a',
        text: '「遅い！」と不満をぶつける',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '9b',
        text: '理由を聞いて納得できれば許す',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '9c',
        text: '次回から遅刻しないよう対策を提案する',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '9d',
        text: '何分遅れたか正確に記録して伝える',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
    ],
  },
  // === 質問10: 論理性（2問目） ===
  {
    id: 10,
    traitAxis: 'rationality',
    text: '新しいことを学ぶとき、あなたのスタイルは？',
    answers: [
      {
        id: '10a',
        text: 'とにかく量をこなして体で覚える',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '10b',
        text: '理論を理解してから実践に移る',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '10c',
        text: '興味が向いたところから自由に学ぶ',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '10d',
        text: '細かいところまでメモを取りながら進める',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
    ],
  },
  // === 質問11: 几帳面さ（2問目） ===
  {
    id: 11,
    traitAxis: 'meticulousness',
    text: '仕事や課題に取り組むとき、あなたは？',
    answers: [
      {
        id: '11a',
        text: '最後までやり遂げることを最優先',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '11b',
        text: '細部まで完璧に仕上げないと気が済まない',
        nenType: 'conjuration',
        traitAxis: 'meticulousness',
      },
      {
        id: '11c',
        text: '勢いで一気に終わらせたい',
        nenType: 'emission',
        traitAxis: 'impulsiveness',
      },
      {
        id: '11d',
        text: '効率を重視し80点で次に進む',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
    ],
  },
  // === 質問12: 独自性（2問目） ===
  {
    id: 12,
    traitAxis: 'individualism',
    text: '将来の夢や目標について、あなたの考えは？',
    answers: [
      {
        id: '12a',
        text: '一つの目標に向かって努力し続けたい',
        nenType: 'enhancement',
        traitAxis: 'simplicity',
      },
      {
        id: '12b',
        text: '将来のことは分からない。その時々で変わる',
        nenType: 'transmutation',
        traitAxis: 'whimsicality',
      },
      {
        id: '12c',
        text: '成功への最短ルートを計算して進みたい',
        nenType: 'manipulation',
        traitAxis: 'rationality',
      },
      {
        id: '12d',
        text: '誰も歩いたことのない道を切り開きたい',
        nenType: 'specialization',
        traitAxis: 'individualism',
      },
    ],
  },
];

export const Question = {
  all: (): readonly Question[] => QUESTIONS,
  getById: (id: number): Question | undefined => QUESTIONS.find((q) => q.id === id),
  count: (): number => QUESTIONS.length,
} as const;
