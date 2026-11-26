import type { AgentStep } from './agent-protocol.ts';
import {
  completion,
  directoryOf,
  editedFile,
  exercisesArchive,
  exercisesName,
  localTaskSentencesOf,
  nodeRequirement,
  testCommand,
  titleOf,
} from './agent-task.ts';

const fence = '```';

export const buildLocalAgentPrompt = (step: AgentStep, origin: string): string => {
  const directory = directoryOf(step);
  const [pass, fail] = completion.split(' / ');
  return [
    '次の手順で演習の環境を作り、課題を解いてください。',
    '',
    '## 環境構築',
    '',
    `Node.js ${nodeRequirement} 以上が必要です。\`node --version\` で確かめてください。npm install は要りません。`,
    '',
    '演習のファイルを取得して展開し、作業ディレクトリでテストを実行します。最初は失敗するテストがあります。これは正しい状態です。',
    '',
    `${fence}sh`,
    `curl -LO ${origin}/${exercisesArchive}`,
    `tar -xf ${exercisesArchive}`,
    `cd ${exercisesName}/${directory}`,
    testCommand,
    fence,
    '',
    '## 課題',
    '',
    titleOf(step),
    '',
    `\`${directory}/${editedFile}\` の \`cancelVisit\` を編集します。`,
    ...localTaskSentencesOf(step),
    '',
    `編集するのは \`${editedFile}\` だけです。\`db.ts\` とテストは変更しないでください。`,
    '',
    '## 完了条件',
    '',
    `\`${testCommand}\` の結果に \`${pass}\` と \`${fail}\` が出れば、ステップ${step}は完了です。`,
    '',
  ].join('\n');
};
