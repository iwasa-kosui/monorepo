export type Tone = 'problem' | 'ok';
export type Lane = { readonly id: string; readonly name: string; readonly kind: 'person' | 'system' | 'table' };
export type Callout = { readonly tone: Tone; readonly label: string; readonly text: string };
export type Step =
  | {
    readonly type: 'message';
    readonly from: string;
    readonly to: string;
    readonly text: string;
    readonly style?: 'call' | 'return' | 'fail';
    readonly callout?: Callout;
  }
  | { readonly type: 'note'; readonly lane: string; readonly text: string; readonly callout?: Callout }
  | { readonly type: 'divider'; readonly text: string };
export type Frame = { readonly label: string; readonly from: number; readonly to: number };
export type Sequence = {
  readonly id: string;
  readonly label: string;
  readonly lanes: readonly Lane[];
  readonly steps: readonly Step[];
  readonly frame?: Frame;
};

export const cancelInquirySequence: Sequence = {
  id: 'cancel-inquiry',
  label: '来院のキャンセルについての問い合わせに、回答できなかった流れの図',
  lanes: [
    { id: 'clinic', name: '動物病院', kind: 'person' },
    { id: 'support', name: 'カスタマーサポート', kind: 'person' },
    { id: 'app', name: '予約システム', kind: 'system' },
    { id: 'visits', name: '`visits` テーブル', kind: 'table' },
  ],
  steps: [
    {
      type: 'message',
      from: 'app',
      to: 'visits',
      text: '`cancelVisit` が `status` を `cancelled` に更新',
      style: 'call',
      callout: { tone: 'problem', label: '課題', text: 'キャンセルした人と理由を保存していない' },
    },
    { type: 'divider', text: '後日' },
    { type: 'message', from: 'clinic', to: 'support', text: '誰が、なぜキャンセルしたのか', style: 'call' },
    { type: 'message', from: 'support', to: 'app', text: '調査を依頼', style: 'call' },
    {
      type: 'message',
      from: 'visits',
      to: 'app',
      text: '`status` が `cancelled` であることだけ',
      style: 'return',
    },
    { type: 'message', from: 'support', to: 'clinic', text: '回答できない', style: 'fail' },
  ],
};

export const cancelDecisionSequence: Sequence = {
  id: 'cancel-decision',
  label: '来院の更新と、キャンセルの記録の追記を、同じトランザクションで実行する図',
  lanes: [
    { id: 'caller', name: '呼び出し元', kind: 'system' },
    { id: 'app', name: '`cancelVisit`', kind: 'system' },
    { id: 'visits', name: '`visits` テーブル', kind: 'table' },
    { id: 'records', name: '`visit_cancellations` テーブル', kind: 'table' },
  ],
  steps: [
    { type: 'message', from: 'caller', to: 'app', text: '理由と、キャンセルした人を渡す', style: 'call' },
    { type: 'message', from: 'app', to: 'visits', text: '`status` を `cancelled` に更新', style: 'call' },
    {
      type: 'message',
      from: 'app',
      to: 'records',
      text: '人、理由、日時を1行追記',
      style: 'call',
      callout: { tone: 'ok', label: '欠落しない', text: 'どちらかが失敗すると、両方をロールバックする' },
    },
  ],
  frame: { label: '同じトランザクション', from: 1, to: 2 },
};

export const externalCancelProblemSequence: Sequence = {
  id: 'external-cancel-problem',
  label: '予約サイトから届いたキャンセルを、予約システムが反映できなかった流れの図',
  lanes: [
    { id: 'owner', name: '飼い主', kind: 'person' },
    { id: 'site', name: '予約サイト', kind: 'system' },
    { id: 'app', name: '予約システム', kind: 'system' },
  ],
  steps: [
    { type: 'message', from: 'owner', to: 'site', text: '来院をキャンセル', style: 'call' },
    { type: 'note', lane: 'site', text: 'キャンセル済みになる' },
    { type: 'message', from: 'site', to: 'app', text: 'キャンセルを送信', style: 'call' },
    {
      type: 'note',
      lane: 'app',
      text: '診察が終わった来院なので、反映できない。診察済みのまま',
      callout: {
        tone: 'problem',
        label: '課題',
        text: '反映できなかったキャンセルを、届いていないキャンセルと区別できない',
      },
    },
    { type: 'divider', text: '後日' },
    { type: 'message', from: 'owner', to: 'app', text: 'キャンセルになっていない', style: 'call' },
    { type: 'message', from: 'app', to: 'owner', text: '届いたかどうかを回答できない', style: 'fail' },
  ],
};

export const externalCancelDecisionSequence: Sequence = {
  id: 'external-cancel-decision',
  label: '予約サイトから届いた事実と、取り込み結果を、同じトランザクションで記録する図',
  lanes: [
    { id: 'site', name: '予約サイト', kind: 'system' },
    { id: 'app', name: '予約システム', kind: 'system' },
    { id: 'events', name: '`business_events` テーブル', kind: 'table' },
    { id: 'visits', name: '`visits` テーブル', kind: 'table' },
  ],
  steps: [
    { type: 'message', from: 'site', to: 'app', text: 'キャンセルを送信', style: 'call' },
    {
      type: 'message',
      from: 'app',
      to: 'events',
      text: '`ExternalCancellationReceived`（届いた内容だけ）',
      style: 'call',
      callout: { tone: 'ok', label: '届いた事実', text: '反映できなくても、届いたことが残る' },
    },
    { type: 'divider', text: 'キャンセルできた場合' },
    { type: 'message', from: 'app', to: 'events', text: '`VisitCancelled`', style: 'call' },
    { type: 'message', from: 'app', to: 'visits', text: 'キャンセル済みに更新', style: 'call' },
    { type: 'divider', text: 'キャンセルできなかった場合' },
    {
      type: 'message',
      from: 'app',
      to: 'events',
      text: '`ExternalCancellationRejected`（理由）',
      style: 'call',
    },
    { type: 'note', lane: 'visits', text: '状態は変えない' },
  ],
  frame: { label: '同じトランザクション', from: 1, to: 7 },
};

export const auditReasonSequence: Sequence = {
  id: 'audit-reason',
  label: '監査ログに残っている変更の理由を、回答できない流れの図',
  lanes: [
    { id: 'it', name: '情シス', kind: 'person' },
    { id: 'dev', name: '開発者', kind: 'person' },
    { id: 'audit', name: '`audit_logs` テーブル', kind: 'table' },
    { id: 'events', name: '`business_events` テーブル', kind: 'table' },
  ],
  steps: [
    { type: 'message', from: 'it', to: 'dev', text: 'この変更の理由を確認したい', style: 'call' },
    { type: 'message', from: 'dev', to: 'audit', text: '変更を参照', style: 'call' },
    {
      type: 'message',
      from: 'audit',
      to: 'dev',
      text: '変更前後の値と操作者',
      style: 'return',
      callout: { tone: 'problem', label: '課題', text: '業務上の理由は持たない' },
    },
    { type: 'message', from: 'dev', to: 'events', text: '理由を参照', style: 'call' },
    {
      type: 'message',
      from: 'events',
      to: 'dev',
      text: '来院のキャンセルの理由だけ',
      style: 'return',
      callout: { tone: 'problem', label: '課題', text: '診察の完了は、まだ記録していない' },
    },
  ],
};
