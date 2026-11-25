import type { WorkspaceScenario } from '../../workspace/scenario';
import { chapter1Question, chapter1RunTests } from './chapter-1';
import { chapter2Change, chapter2Explain, chapter2Step1, chapter2Step2, chapter2Table } from './chapter-2';
import { chapter3Answer, chapter3Before, chapter3Read, chapter3Table } from './chapter-3';
import {
  chapter4AuditLog,
  chapter4Compare,
  chapter4ExternalSync,
  chapter4Overview,
  chapter4SummaryTable,
  chapter4Takeaway,
} from './chapter-4';
import { summaryDecide, summaryToday } from './summary';

export const lessonScenarios: Readonly<Record<string, WorkspaceScenario>> = {
  'chapter-1/01': chapter1Question,
  'chapter-1/02': chapter1RunTests,
  'chapter-2/01': chapter2Explain,
  'chapter-2/02': chapter2Step1,
  'chapter-2/03': chapter2Table,
  'chapter-2/04': chapter2Step2,
  'chapter-2/05': chapter2Change,
  'chapter-3/01': chapter3Answer,
  'chapter-3/02': chapter3Read,
  'chapter-3/03': chapter3Table,
  'chapter-3/04': chapter3Before,
  'chapter-4/01': chapter4Overview,
  'chapter-4/02': chapter4SummaryTable,
  'chapter-4/03': chapter4ExternalSync,
  'chapter-4/04': chapter4AuditLog,
  'chapter-4/05': chapter4Compare,
  'chapter-4/06': chapter4Takeaway,
  'summary/01': summaryToday,
  'summary/02': summaryDecide,
};
