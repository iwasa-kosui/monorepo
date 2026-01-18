import type { NenType } from '../nenType/nenType.ts';

/**
 * 判断軸 - 二項対立の特性軸
 * 改善版: empathy（情の深さ）とcharisma（カリスマ性）を追加
 */
export const JUDGMENT_AXES = [
  'commitment',
  'logic',
  'independence',
  'caution',
  'honesty',
  'empathy',
  'charisma',
] as const;

export type JudgmentAxis = (typeof JUDGMENT_AXES)[number];

export type AxisDirection = 'positive' | 'negative';

export type AxisInfo = Readonly<{
  id: JudgmentAxis;
  japaneseName: string;
  positiveLabel: string;
  negativeLabel: string;
  description: string;
}>;

export type AxisContribution = Readonly<{
  positive: readonly { nenType: NenType; weight: number }[];
  negative: readonly { nenType: NenType; weight: number }[];
}>;

/**
 * 各判断軸の情報
 */
export const AXIS_INFO: Record<JudgmentAxis, AxisInfo> = {
  commitment: {
    id: 'commitment',
    japaneseName: '一途さ',
    positiveLabel: '一途・こだわり',
    negativeLabel: '柔軟・適応的',
    description: '一度決めたことへの執着度',
  },
  logic: {
    id: 'logic',
    japaneseName: '論理性',
    positiveLabel: '論理的・計画的',
    negativeLabel: '直感的・即興的',
    description: '物事を考える際のアプローチ',
  },
  independence: {
    id: 'independence',
    japaneseName: '独立性',
    positiveLabel: '個人主義・独自',
    negativeLabel: '協調的・順応',
    description: '周囲との関係性の取り方',
  },
  caution: {
    id: 'caution',
    japaneseName: '慎重さ',
    positiveLabel: '慎重・几帳面',
    negativeLabel: '大胆・大雑把',
    description: '行動の際の細やかさ',
  },
  honesty: {
    id: 'honesty',
    japaneseName: '率直さ',
    positiveLabel: '率直・正直',
    negativeLabel: '策略的・計算高い',
    description: 'コミュニケーションスタイル',
  },
  empathy: {
    id: 'empathy',
    japaneseName: '情の深さ',
    positiveLabel: '情に厚い・熱血',
    negativeLabel: '冷静・ドライ',
    description: '他者への感情的な関わり方',
  },
  charisma: {
    id: 'charisma',
    japaneseName: 'カリスマ性',
    positiveLabel: '人を惹きつける',
    negativeLabel: '控えめ・裏方',
    description: '他者への影響力の強さ',
  },
};

/**
 * 判断軸と念系統のマッピング（1:N関係）
 * 各軸の傾向が複数の念系統に寄与する
 *
 * 改善点:
 * - empathy軸を追加: 放出系（情に厚い）の識別を強化
 * - charisma軸を追加: 特質系（カリスマ性）の識別を強化
 * - honesty軸の変化系への寄与を強化（嘘つき特性）
 * - independence軸の特質系への寄与を強化
 */
export const AXIS_CONTRIBUTIONS: Record<JudgmentAxis, AxisContribution> = {
  commitment: {
    // 一途・こだわり → 強化系（主）、具現化系（副）
    positive: [
      { nenType: 'enhancement', weight: 1.0 },
      { nenType: 'conjuration', weight: 0.5 },
    ],
    // 柔軟・適応的 → 変化系（主）
    negative: [{ nenType: 'transmutation', weight: 1.0 }],
  },
  logic: {
    // 論理的・計画的 → 操作系（主）、具現化系（副）
    positive: [
      { nenType: 'manipulation', weight: 1.0 },
      { nenType: 'conjuration', weight: 0.5 },
    ],
    // 直感的・即興的 → 強化系（主）、変化系（副）
    negative: [
      { nenType: 'enhancement', weight: 0.8 },
      { nenType: 'transmutation', weight: 0.5 },
    ],
  },
  independence: {
    // 個人主義・独自 → 特質系（主）、変化系（副）
    positive: [
      { nenType: 'specialization', weight: 1.5 },
      { nenType: 'transmutation', weight: 0.5 },
    ],
    // 協調的・順応 → 強化系（主）
    negative: [{ nenType: 'enhancement', weight: 0.8 }],
  },
  caution: {
    // 慎重・几帳面 → 具現化系（主）、操作系（副）
    positive: [
      { nenType: 'conjuration', weight: 1.0 },
      { nenType: 'manipulation', weight: 0.5 },
    ],
    // 大胆・大雑把 → 放出系（主）、強化系（副）
    negative: [
      { nenType: 'emission', weight: 1.0 },
      { nenType: 'enhancement', weight: 0.3 },
    ],
  },
  honesty: {
    // 率直・正直 → 強化系（主）
    positive: [{ nenType: 'enhancement', weight: 1.0 }],
    // 策略的・計算高い → 変化系（主）、操作系（副）
    negative: [
      { nenType: 'transmutation', weight: 1.0 },
      { nenType: 'manipulation', weight: 0.8 },
    ],
  },
  empathy: {
    // 情に厚い・熱血 → 放出系（主）、強化系（副）
    positive: [
      { nenType: 'emission', weight: 1.2 },
      { nenType: 'enhancement', weight: 0.5 },
    ],
    // 冷静・ドライ → 操作系（主）、具現化系（副）
    negative: [
      { nenType: 'manipulation', weight: 0.8 },
      { nenType: 'conjuration', weight: 0.5 },
    ],
  },
  charisma: {
    // 人を惹きつける → 特質系（主）、強化系（副）
    positive: [
      { nenType: 'specialization', weight: 1.5 },
      { nenType: 'enhancement', weight: 0.3 },
    ],
    // 控えめ・裏方 → 具現化系（主）、操作系（副）
    negative: [
      { nenType: 'conjuration', weight: 0.8 },
      { nenType: 'manipulation', weight: 0.5 },
    ],
  },
};

export const JudgmentAxis = {
  all: (): readonly JudgmentAxis[] => JUDGMENT_AXES,
  getInfo: (axis: JudgmentAxis): AxisInfo => AXIS_INFO[axis],
  getContribution: (axis: JudgmentAxis): AxisContribution => AXIS_CONTRIBUTIONS[axis],
} as const;
