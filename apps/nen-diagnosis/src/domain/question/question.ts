import type { AxisDirection, JudgmentAxis } from '../judgmentAxis/judgmentAxis.ts';

export type Answer = Readonly<{
  id: string;
  text: string;
  axis: JudgmentAxis;
  direction: AxisDirection;
}>;

export type Question = Readonly<{
  id: number;
  /** この質問で測定する判断軸 */
  axis: JudgmentAxis;
  /** 質問文 */
  text: string;
  /** 選択肢（2つ：positive側とnegative側） */
  answers: readonly Answer[];
}>;

/**
 * 質問リスト - 各軸について2問ずつ、計10問
 */
export const QUESTIONS: readonly Question[] = [
  // === 軸1: 一途さ（commitment）===
  {
    id: 1,
    axis: 'commitment',
    text: '目標達成に最も大切なのは？',
    answers: [
      {
        id: '1a',
        text: '一度決めたら最後まで諦めない意志',
        axis: 'commitment',
        direction: 'positive',
      },
      {
        id: '1b',
        text: '状況に合わせて柔軟にやり方を変えること',
        axis: 'commitment',
        direction: 'negative',
      },
    ],
  },
  {
    id: 2,
    axis: 'commitment',
    text: '挫折を経験したとき、あなたの考えは？',
    answers: [
      {
        id: '2a',
        text: '何度でも立ち上がる。諦めたら終わり',
        axis: 'commitment',
        direction: 'positive',
      },
      {
        id: '2b',
        text: '別の道を探せばいい。執着しない',
        axis: 'commitment',
        direction: 'negative',
      },
    ],
  },
  // === 軸2: 論理性（logic）===
  {
    id: 3,
    axis: 'logic',
    text: '新しいことを学ぶとき、あなたのスタイルは？',
    answers: [
      {
        id: '3a',
        text: '理論を理解してから実践に移る',
        axis: 'logic',
        direction: 'positive',
      },
      {
        id: '3b',
        text: '興味が向いたところから自由に学ぶ',
        axis: 'logic',
        direction: 'negative',
      },
    ],
  },
  {
    id: 4,
    axis: 'logic',
    text: '重要な決断をするとき、あなたは？',
    answers: [
      {
        id: '4a',
        text: 'メリット・デメリットを整理して論理的に判断',
        axis: 'logic',
        direction: 'positive',
      },
      {
        id: '4b',
        text: '直感を信じて決める',
        axis: 'logic',
        direction: 'negative',
      },
    ],
  },
  // === 軸3: 独立性（independence）===
  {
    id: 5,
    axis: 'independence',
    text: '周囲と意見が違うとき、あなたは？',
    answers: [
      {
        id: '5a',
        text: '自分の意見を曲げずに貫く',
        axis: 'independence',
        direction: 'positive',
      },
      {
        id: '5b',
        text: '周りの意見も取り入れて調整する',
        axis: 'independence',
        direction: 'negative',
      },
    ],
  },
  {
    id: 6,
    axis: 'independence',
    text: 'チームで働くとき、あなたの傾向は？',
    answers: [
      {
        id: '6a',
        text: '自分のやり方で進めたい。干渉されたくない',
        axis: 'independence',
        direction: 'positive',
      },
      {
        id: '6b',
        text: '仲間と協力し、一緒に進めたい',
        axis: 'independence',
        direction: 'negative',
      },
    ],
  },
  // === 軸4: 慎重さ（caution）===
  {
    id: 7,
    axis: 'caution',
    text: '仕事や課題に取り組むとき、あなたは？',
    answers: [
      {
        id: '7a',
        text: '細部まで完璧に仕上げないと気が済まない',
        axis: 'caution',
        direction: 'positive',
      },
      {
        id: '7b',
        text: '勢いで一気に終わらせたい。完璧より完了',
        axis: 'caution',
        direction: 'negative',
      },
    ],
  },
  {
    id: 8,
    axis: 'caution',
    text: '部屋の片付けについて、あなたのスタンスは？',
    answers: [
      {
        id: '8a',
        text: '定位置を決めて必ず元に戻す',
        axis: 'caution',
        direction: 'positive',
      },
      {
        id: '8b',
        text: '散らかっても気にならない',
        axis: 'caution',
        direction: 'negative',
      },
    ],
  },
  // === 軸5: 率直さ（honesty）===
  {
    id: 9,
    axis: 'honesty',
    text: '約束の時間に遅れそうなとき、あなたは？',
    answers: [
      {
        id: '9a',
        text: '正直に「遅れる」と連絡する',
        axis: 'honesty',
        direction: 'positive',
      },
      {
        id: '9b',
        text: '適当な言い訳を考える',
        axis: 'honesty',
        direction: 'negative',
      },
    ],
  },
  {
    id: 10,
    axis: 'honesty',
    text: '「あなたは嘘つきだ」と言われたら？',
    answers: [
      {
        id: '10a',
        text: '心外だ。嘘はつかない主義',
        axis: 'honesty',
        direction: 'positive',
      },
      {
        id: '10b',
        text: '嘘も方便。状況に応じて使い分けるのは当然',
        axis: 'honesty',
        direction: 'negative',
      },
    ],
  },
];

export const Question = {
  all: (): readonly Question[] => QUESTIONS,
  getById: (id: number): Question | undefined => QUESTIONS.find((q) => q.id === id),
  count: (): number => QUESTIONS.length,
} as const;
