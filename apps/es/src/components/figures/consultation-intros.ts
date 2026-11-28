export type ConsultationKey = 'summary-table' | 'external-sync' | 'audit-log';

export type Speaker = { readonly name: string; readonly avatar: string; readonly role?: string };
export type CountBox = {
  readonly table: string;
  readonly note: string;
  readonly count: string;
  readonly unit: string;
};
export type StateBox = { readonly system: string; readonly state: string; readonly detail?: string };
export type ColumnValue = { readonly column: string; readonly value: string; readonly mono: boolean };
export type Excerpt =
  | { readonly kind: 'counts'; readonly boxes: readonly CountBox[] }
  | { readonly kind: 'states'; readonly boxes: readonly StateBox[] }
  | {
    readonly kind: 'columns';
    readonly table: string;
    readonly columns: readonly ColumnValue[];
    readonly missing: string;
  };
export type ConsultationIntro = {
  readonly lead: string;
  readonly label: string;
  readonly speaker: Speaker;
  readonly question: string;
  readonly heading: string;
  readonly excerpt: Excerpt;
  readonly problem: string;
};

export const consultationIntros = {
  'summary-table': {
    lead: '集計テーブルがあるシステムでは、集計の件数と、記録から数えた件数が合わないことがあります。',
    label:
      '経理から、4月1日の診察のキャンセル件数について、集計の3件と業務イベントから数えた2件のどちらが正しいかを聞かれ、記録から示せないことを表す図',
    speaker: { name: '経理', avatar: '経' },
    question: '4月1日の診察のキャンセル件数は、3件と2件のどちらが正しいか',
    heading: 'いまのデータ',
    excerpt: {
      kind: 'counts',
      boxes: [
        { table: 'daily_cancellation_counts', note: '集計', count: '3', unit: '件' },
        { table: 'business_events', note: '`VisitCancelled` を数えた値', count: '2', unit: '件' },
      ],
    },
    problem: 'どちらが正しいかを、記録から示せない',
  },
  'external-sync': {
    lead: '外部システムと同期するシステムでは、相手の画面と自分の画面で、同じ予約の状態が食い違うことがあります。',
    label:
      'カスタマーサポートから、コタロウの予約が予約サイトではキャンセル済み、予約システムでは診察済みであることについて聞かれ、キャンセルが届いたかどうかを区別できないことを表す図',
    speaker: { name: 'カスタマーサポート', avatar: 'カ', role: '飼い主からの連絡' },
    question: 'コタロウの予約は、キャンセル済みと診察済みのどちらが正しいか',
    heading: 'いまのデータ',
    excerpt: {
      kind: 'states',
      boxes: [
        { system: '予約サイト', state: 'キャンセル済み' },
        { system: '予約システム', state: '診察済み', detail: '`visits.status` は `completed`' },
      ],
    },
    problem: 'キャンセルが届かなかったのか、届いたが反映しなかったのかを区別できない',
  },
  'audit-log': {
    lead: '監査ログがあるシステムでも、変更の理由を聞かれると回答できないことがあります。',
    label:
      '情シスから、監査対応で reserved から cancelled への変更の理由を聞かれ、監査ログには変更前後の値と操作者だけがあり、理由を回答できないことを表す図',
    speaker: { name: '情シス', avatar: '情', role: '監査対応' },
    question: '`reserved` から `cancelled` に変更した理由は何か',
    heading: 'いまのデータ',
    excerpt: {
      kind: 'columns',
      table: 'audit_logs',
      columns: [
        { column: 'old_value', value: 'reserved', mono: true },
        { column: 'new_value', value: 'cancelled', mono: true },
        { column: 'operated_by', value: '受付スタッフ', mono: false },
      ],
      missing: '理由の列は無い',
    },
    problem: '変更前後の値と操作者は分かるが、業務上の理由を回答できない',
  },
} as const satisfies Record<ConsultationKey, ConsultationIntro>;
