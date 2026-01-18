export const NEN_TYPES = [
  'enhancement',
  'transmutation',
  'emission',
  'manipulation',
  'conjuration',
  'specialization',
] as const;

export type NenType = (typeof NEN_TYPES)[number];

export type NenTypeInfo = Readonly<{
  id: NenType;
  name: string;
  japaneseName: string;
  description: string;
  personality: string;
  waterDivinationResult: string;
  compatibleTypes: readonly NenType[];
  incompatibleTypes: readonly NenType[];
  color: string;
  bgColor: string;
}>;

const nenTypeInfoMap: Record<NenType, NenTypeInfo> = {
  enhancement: {
    id: 'enhancement',
    name: 'Enhancement',
    japaneseName: '強化系',
    description: '自己の肉体やオーラを強化する能力',
    personality:
      '単純で一途。曲がったことが嫌いで、思ったことをすぐ口にする。決意が固く、一度決めたことは最後までやり通す。',
    waterDivinationResult: 'コップの水が溢れる',
    compatibleTypes: ['enhancement', 'transmutation', 'emission'],
    incompatibleTypes: ['specialization'],
    color: '#FFD700',
    bgColor: 'bg-yellow-500',
  },
  transmutation: {
    id: 'transmutation',
    name: 'Transmutation',
    japaneseName: '変化系',
    description: 'オーラの性質を変化させる能力',
    personality: '気まぐれで嘘つき。でも自分の嘘は嘘だと思っていない。独自の価値観を持ち、周りに流されない。',
    waterDivinationResult: '水の味が変わる',
    compatibleTypes: ['enhancement', 'transmutation', 'conjuration'],
    incompatibleTypes: ['emission'],
    color: '#9370DB',
    bgColor: 'bg-purple-500',
  },
  emission: {
    id: 'emission',
    name: 'Emission',
    japaneseName: '放出系',
    description: 'オーラを体から離して飛ばす能力',
    personality: '短気で大雑把。細かいことを気にしない。情に厚く、仲間思い。',
    waterDivinationResult: '水の色が変わる',
    compatibleTypes: ['enhancement', 'emission', 'manipulation'],
    incompatibleTypes: ['transmutation'],
    color: '#FF6347',
    bgColor: 'bg-red-500',
  },
  manipulation: {
    id: 'manipulation',
    name: 'Manipulation',
    japaneseName: '操作系',
    description: '物や生き物を操る能力',
    personality:
      '論理的で理屈っぽい。自分の思い通りにしたがり、マイペース。計画性があり、目的のためには手段を選ばない。',
    waterDivinationResult: '葉っぱが水面で動く',
    compatibleTypes: ['emission', 'manipulation', 'specialization'],
    incompatibleTypes: ['conjuration'],
    color: '#4169E1',
    bgColor: 'bg-blue-600',
  },
  conjuration: {
    id: 'conjuration',
    name: 'Conjuration',
    japaneseName: '具現化系',
    description: 'オーラを物質化する能力',
    personality: '神経質で真面目。几帳面でルールを守る。こだわりが強く、完璧主義。',
    waterDivinationResult: '水中に不純物が現れる',
    compatibleTypes: ['transmutation', 'conjuration', 'specialization'],
    incompatibleTypes: ['manipulation'],
    color: '#32CD32',
    bgColor: 'bg-green-500',
  },
  specialization: {
    id: 'specialization',
    name: 'Specialization',
    japaneseName: '特質系',
    description: '他の系統に分類できない特殊な能力',
    personality:
      '個人主義でカリスマ性がある。独自の世界観を持ち、普通とは違う視点で物事を見る。時に周囲を惹きつけ、時に孤立する。',
    waterDivinationResult: '予測不能な変化が起こる',
    compatibleTypes: ['manipulation', 'conjuration', 'specialization'],
    incompatibleTypes: ['enhancement'],
    color: '#FF69B4',
    bgColor: 'bg-pink-500',
  },
};

export const NenType = {
  all: (): readonly NenType[] => NEN_TYPES,
  getInfo: (type: NenType): NenTypeInfo => nenTypeInfoMap[type],
} as const;
