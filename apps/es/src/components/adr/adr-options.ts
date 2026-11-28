import {
  cancelAppendInUpdateSequence,
  cancelByDbFeatureSequence,
  cancelInSeparateTransactionSequence,
  cancelInVisitsSequence,
  cancelToLogSequence,
  rebuildSystemSequence,
  type Sequence,
} from '../figures/sequences';

export type Mark = '○' | '△' | '×';

export type AdrOption = {
  readonly id?: string;
  readonly name: string;
  readonly adopted?: boolean;
  readonly marks: readonly Mark[];
  readonly merit: string;
  readonly demerit: string;
  readonly sequence?: Sequence;
};

export type CancelRecordOption = AdrOption & { readonly id: string; readonly sequence: Sequence };

export const cancelRecordCriteria: readonly string[] = [
  '人と理由を回答できる',
  '記録が欠落しない',
  '既存のデータモデルに影響を与えない',
];

export const cancelRecordOptions: readonly CancelRecordOption[] = [
  {
    id: 'append-in-update',
    name: '更新処理の中で追記する',
    adopted: true,
    marks: ['○', '○', '○'],
    merit: '問い合わせに回答でき、記録が欠落しません。',
    demerit: '記録の保存に不具合があると、来院のキャンセルも失敗します。',
    sequence: cancelAppendInUpdateSequence,
  },
  {
    id: 'write-to-log',
    name: 'ログに出力する',
    marks: ['○', '×', '○'],
    merit: 'DB の変更が不要です。',
    demerit: 'ログの出力は来院の更新と同じトランザクションに含められないため、記録が欠落します。',
    sequence: cancelToLogSequence,
  },
  {
    id: 'add-visits-column',
    name: '`visits` に列を追加する',
    marks: ['△', '○', '×'],
    merit: 'テーブルが増えず、来院ごとのキャンセルが1回だけであれば十分です。',
    demerit: '同じ来院を再びキャンセルすると前回の人と理由を上書きし、`visits` テーブルの変更も必要です。',
    sequence: cancelInVisitsSequence,
  },
  {
    id: 'db-feature',
    name: 'DB の機能で自動的に記録する',
    marks: ['×', '○', '○'],
    merit: '更新処理ごとのコードの追加が不要で、SQL で直接 `UPDATE` した変更も記録されます。',
    demerit: '自動的に記録できるのは変更前後の値だけで、キャンセルした人と理由は記録できません。',
    sequence: cancelByDbFeatureSequence,
  },
  {
    id: 'separate-transaction',
    name: '別のトランザクションで記録する',
    marks: ['○', '×', '○'],
    merit: '記録の不具合が来院のキャンセルを止めません。',
    demerit: '記録に失敗すると更新だけが成功し、そのキャンセルの記録は欠落します。',
    sequence: cancelInSeparateTransactionSequence,
  },
  {
    id: 'rebuild-system',
    name: 'システム全体を作り直す',
    marks: ['○', '○', '×'],
    merit: '記録の実装が漏れる更新処理が無くなります。',
    demerit: '全機能を一度に移行するため、停止と不具合のリスクが大きくなります。',
    sequence: rebuildSystemSequence,
  },
];
