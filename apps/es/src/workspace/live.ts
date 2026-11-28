import { normalizeName } from './live-protocol';
import type { ActorTone } from './scenario';

const moods = [
  '眠い',
  '元気な',
  '慎重な',
  '気まぐれな',
  '腹ぺこの',
  'ご機嫌な',
  '夜型の',
  '朝型の',
  '働き者の',
  '寒がりの',
  '暑がりの',
  '早起きの',
  '食いしん坊の',
  '人見知りの',
  '甘えん坊の',
  '散歩好きの',
] as const;

const animals = [
  '柴犬',
  '三毛猫',
  'うさぎ',
  'ハムスター',
  'インコ',
  'カメ',
  'フェレット',
  'ハリネズミ',
  'モルモット',
  'チンチラ',
  '文鳥',
  '金魚',
  'コーギー',
  'トイプードル',
  '黒猫',
  'オカメインコ',
  'デグー',
  'モモンガ',
  'シマリス',
  'ダックスフンド',
  'チワワ',
  'キジトラ',
  'ヤモリ',
  'メダカ',
] as const;

const pick = <T>(items: readonly T[], random: () => number): T => {
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[index] as T;
};

export const randomName = (random: () => number): string => `${pick(moods, random)}${pick(animals, random)}`;

export const nameOrRandom = (saved: string | null, random: () => number): string => {
  const name = normalizeName(saved ?? '');
  return name === '' ? randomName(random) : name;
};

export const avatarOf = (name: string): string => [...name.trim()][0] ?? '?';

const tones: readonly ActorTone[] = ['rose', 'blue', 'green', 'amber', 'violet', 'slate'];

export const toneOf = (author: string): ActorTone => {
  let hash = 0;
  for (const char of author) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973;
  return tones[hash % tones.length] ?? 'slate';
};

export const reconnectDelayMs = (attempt: number): number => Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4));

export type EnterKey = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
};

export const sendsOnEnter = (event: EnterKey, finePointer: boolean): boolean =>
  finePointer && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;

export const liveUrlOf = (
  location: { readonly protocol: string; readonly host: string },
  path: string,
  sender: string,
): string =>
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}?sender=${encodeURIComponent(sender)}`;
