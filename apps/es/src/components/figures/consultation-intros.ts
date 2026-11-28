export type ConsultationKey = 'summary-table' | 'external-sync' | 'audit-log';

export type Speaker = { readonly name: string; readonly avatar: string; readonly role?: string };
export type TimelinePoint = { readonly kind: 'cancel' | 'introduction'; readonly label: string };
export type TimelineCell = { readonly text: string; readonly tone: 'plain' | 'mono' | 'ghost' };
export type TimelineRow = {
  readonly name: string;
  readonly note?: string;
  readonly cells: readonly TimelineCell[];
  readonly count: string;
  readonly unit: string;
};
export type SystemNode = {
  readonly name: string;
  readonly note?: string;
  readonly person: string;
  readonly action: string;
  readonly state: string;
  readonly detail?: string;
};
export type ColumnValue = { readonly column: string; readonly value: string; readonly mono: boolean };
export type TableUpdate = { readonly label: string; readonly table: string; readonly content: string };
export type TableLog = {
  readonly label: string;
  readonly table: string;
  readonly columns: readonly ColumnValue[];
  readonly missing: string;
};
export type Excerpt =
  | {
    readonly kind: 'timeline';
    readonly points: readonly TimelinePoint[];
    readonly rows: readonly TimelineRow[];
  }
  | {
    readonly kind: 'architecture';
    readonly source: SystemNode;
    readonly target: SystemNode;
    readonly link: string;
  }
  | {
    readonly kind: 'recording';
    readonly person: string;
    readonly action: string;
    readonly system: string;
    readonly update: TableUpdate;
    readonly log: TableLog;
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
    lead: '業務イベントは、既存のシステムに途中から導入しました。',
    label:
      '1件目のキャンセルの後に業務イベントを導入し、その後に2件目と3件目のキャンセルがあったため、集計の daily_cancellation_counts は3件、business_events の VisitCancelled は2件になり、業務イベントから数えた件数が実際の件数と合わないことを表す図',
    speaker: { name: '経理', avatar: '経' },
    question: '4月1日の診察のキャンセル件数は、3件と2件のどちらが正しいか',
    heading: '4月1日の診察のキャンセルの記録',
    excerpt: {
      kind: 'timeline',
      points: [
        { kind: 'cancel', label: '1件目のキャンセル' },
        { kind: 'introduction', label: '業務イベントを導入' },
        { kind: 'cancel', label: '2件目のキャンセル' },
        { kind: 'cancel', label: '3件目のキャンセル' },
      ],
      rows: [
        {
          name: 'daily_cancellation_counts',
          note: '集計',
          cells: [
            { text: '+1', tone: 'plain' },
            { text: '+1', tone: 'plain' },
            { text: '+1', tone: 'plain' },
          ],
          count: '3',
          unit: '件',
        },
        {
          name: 'business_events',
          cells: [
            { text: '記録なし', tone: 'ghost' },
            { text: 'VisitCancelled', tone: 'mono' },
            { text: 'VisitCancelled', tone: 'mono' },
          ],
          count: '2',
          unit: '件',
        },
      ],
    },
    problem: '導入する前のキャンセルが無いため、業務イベントから数えた件数が実際と合わない',
  },
  'external-sync': {
    lead: '予約システムは、外部の予約サイトからキャンセルを受け取ります。',
    label:
      '飼い主が外部の予約サイトでキャンセルし、予約サイトがキャンセルを予約システムへ送る構成で、予約サイトではキャンセル済み、動物病院が診察を完了した予約システムでは診察済みになり、キャンセルが届いたかどうかを区別できないことを表す図',
    speaker: { name: 'カスタマーサポート', avatar: 'カ', role: '飼い主からの連絡' },
    question: 'コタロウの予約は、キャンセル済みと診察済みのどちらが正しいか',
    heading: 'システムの構成といまのデータ',
    excerpt: {
      kind: 'architecture',
      source: {
        name: '予約サイト',
        note: '外部システム',
        person: '飼い主',
        action: 'キャンセルする',
        state: 'キャンセル済み',
      },
      target: {
        name: '予約システム',
        person: '動物病院',
        action: '診察を完了する',
        state: '診察済み',
        detail: '`visits.status` は `completed`',
      },
      link: 'キャンセルを送る',
    },
    problem: 'キャンセルが届かなかったのか、届いたが反映しなかったのかを区別できない',
  },
  'audit-log': {
    lead: '予約システムは、変更前後の値と操作者を監査ログに記録しています。',
    label:
      '受付スタッフが予約システムでキャンセルすると、予約システムが visits を更新し、変更前後の値と操作者を audit_logs に記録する構成で、audit_logs に理由の列が無いため、情シスから聞かれた変更の理由を回答できないことを表す図',
    speaker: { name: '情シス', avatar: '情', role: '監査対応' },
    question: '`reserved` から `cancelled` に変更した理由は何か',
    heading: 'システムの構成といまのデータ',
    excerpt: {
      kind: 'recording',
      person: '受付スタッフ',
      action: 'キャンセルする',
      system: '予約システム',
      update: { label: '更新する', table: 'visits', content: '`status` を `cancelled` に変更' },
      log: {
        label: '変更を記録する',
        table: 'audit_logs',
        columns: [
          { column: 'old_value', value: 'reserved', mono: true },
          { column: 'new_value', value: 'cancelled', mono: true },
          { column: 'operated_by', value: '受付スタッフ', mono: false },
        ],
        missing: '理由の列は無い',
      },
    },
    problem: '変更前後の値と操作者は分かるが、業務上の理由を回答できない',
  },
} as const satisfies Record<ConsultationKey, ConsultationIntro>;
