import type { WorkspaceScenario } from '../../workspace/scenario';
import { eventCenteredEditor } from './scenario';

export interface PlaygroundProps {
  readonly exercise: string;
  readonly editable: string[];
  readonly readonly: string[];
  readonly testFile: string;
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
      editable: ['visit.ts', 'visit-store.ts', 'visits.ts', 'business-event.ts'],
      readonly: ['visits.test.ts', 'db.ts'],
      testFile: 'visits.test.ts',
    },
  },
} satisfies Record<string, Embed>;
