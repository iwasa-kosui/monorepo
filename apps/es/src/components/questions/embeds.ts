import type { Tour } from '../../playground/tour';
import type { WorkspaceScenario } from '../../workspace/scenario';
import { eventCenteredEditor } from './scenario';

export interface PlaygroundProps {
  readonly exercise: string;
  readonly editable: string[];
  readonly readonly: string[];
  readonly opened?: string[];
  readonly testFile: string;
  readonly tour?: Tour;
}

export interface Embed {
  readonly title: string;
  readonly scenario: WorkspaceScenario;
  readonly playground: PlaygroundProps;
}

export const embeds = {
  'event-centered': {
    title: '来院のキャンセルを、業務イベントを返す関数と保存する処理で書いたコード',
    scenario: eventCenteredEditor,
    playground: {
      exercise: 'chapter-2-event-centered',
      editable: [
        'visits.ts',
        'src/useCase/cancelVisit.ts',
        'src/domain/visit/visit.ts',
        'src/domain/aggregate/event.ts',
        'src/domain/aggregate/aggregate.ts',
        'src/adaptor/sqlite/visit/visitResolver.ts',
        'src/adaptor/sqlite/visit/visitCancelledStore.ts',
        'src/adaptor/sqlite/eventRow.ts',
        'src/useCase/useCase.ts',
      ],
      readonly: ['visits.test.ts', 'db.ts'],
      opened: ['visits.ts', 'visits.test.ts'],
      testFile: 'visits.test.ts',
      tour: {
        title: '来院のキャンセルが処理される順にコードをたどる',
        steps: [
          {
            file: 'visits.ts',
            anchor: 'export const cancelVisit = ',
            lines: 8,
            title: '入口は第2章と同じ cancelVisit',
            body:
              '公開している関数の名前と引数は、第2章のステップ2と同じです。関数の中身は、ユースケースに、読む処理、保存する処理、トランザクションを渡して実行するだけです。',
          },
          {
            file: 'src/useCase/cancelVisit.ts',
            anchor: 'const create = (',
            lines: 8,
            title: '読む、判定する、保存するを1つのトランザクションにまとめる',
            body:
              'ユースケースは、来院を読み、`Visit.cancel` に判定を任せ、返ってきた業務イベントを保存します。DB の操作は、受け取った `visitResolver` と `visitCancelledStore` が行います。',
          },
          {
            file: 'src/adaptor/sqlite/visit/visitResolver.ts',
            anchor: 'resolve: (visitId) => {',
            lines: 7,
            title: '現在の状態は visits から読む',
            body: '記録から現在の状態を組み立て直すことはしません。第2章と同じく、`visits` の行を読みます。',
          },
          {
            file: 'src/domain/visit/visit.ts',
            anchor: 'const cancel = (',
            lines: 8,
            title: 'ビジネスロジックは DB に触れない',
            body:
              'キャンセルできるかどうかを、受け取った来院だけで判定します。このファイルには、`UPDATE` 文も `INSERT` 文もありません。',
          },
          {
            file: 'src/domain/visit/visit.ts',
            anchor: 'return VisitEvent.create(',
            lines: 7,
            title: '判定の結果を、業務イベントとして返す',
            body:
              '業務イベントは、理由と操作した人に加えて、`status` を `cancelled` にした変更後の来院を持ちます。この来院が、後で `visits` と `business_events` の両方に書かれます。',
          },
          {
            file: 'src/domain/aggregate/event.ts',
            anchor: 'export type BusinessEvent<',
            lines: 8,
            title: '集約と業務イベントの型は、来院に依存しない',
            body:
              '集約は、来院のように、ID と状態を持つ対象です。`BusinessEvent` は、どの集約に何が起きたかを表します。来院のキャンセル以外の更新処理も、同じ型と `BusinessEvent.createFactory` を使えます。',
          },
          {
            file: 'src/adaptor/sqlite/visit/visitCancelledStore.ts',
            anchor: 'store: (event) => {',
            lines: 7,
            title: '同じ業務イベントから、状態と記録の両方に書く',
            body:
              '`visits` に書く `status` も、`business_events` に書く行も、同じ `event` から取ります。そのため、2つの値は一致します。',
          },
          {
            file: 'visits.test.ts',
            anchor: 'describe(\'第2章 ステップ2\'',
            lines: 1,
            title: 'テストは第2章のステップ2と同じ',
            body:
              '公開している関数を変えていないので、同じテストがそのまま成功します。「テストを実行する」で確認できます。',
          },
        ],
      },
    },
  },
} satisfies Record<string, Embed>;
