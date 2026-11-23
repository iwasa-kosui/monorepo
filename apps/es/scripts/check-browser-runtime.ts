import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';

import { runCode } from '../src/playground/engine/run-code.ts';

const SQL = await initSqlJs();

const exercisesDir = join(import.meta.dirname, '..', 'exercises');
const reporter = join(import.meta.dirname, 'json-lines-reporter.ts');
const sharedFiles = new Set(['db.ts', 'visits.ts', 'visits.test.ts']);

const errors: string[] = [];
const notes: string[] = [];

const normalize = (text: string): string =>
  text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<時刻>')
    .trimEnd();

const readFiles = (dir: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(join(exercisesDir, dir))
      .filter((file) => file.endsWith('.ts'))
      .map((file) => [file, readFileSync(join(exercisesDir, dir, file), 'utf8')]),
  );

type NodeTest = { result: string; name: string; message?: string };

const runNodeTests = (dir: string): { tests: Map<string, NodeTest>; status: number | null } => {
  const run = spawnSync(
    process.execPath,
    ['--no-warnings', '--test', `--test-reporter=${reporter}`, 'visits.test.ts'],
    { cwd: join(exercisesDir, dir), encoding: 'utf8' },
  );
  const tests = new Map<string, NodeTest>(
    run.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const test = JSON.parse(line) as NodeTest;
      return [test.name, test];
    }),
  );
  return { tests, status: run.status };
};

const counts = (statuses: readonly string[]): string =>
  `pass ${statuses.filter((status) => status === 'pass').length} / fail ${
    statuses.filter((status) => status === 'fail').length
  }`;

const checkTests = async (dir: string, files: Record<string, string>): Promise<void> => {
  const node = runNodeTests(dir);
  const browser = await runCode({ SQL, files, entry: 'visits.test.ts' });
  if (browser.error !== null || browser.tests === null) {
    errors.push(`${dir}: ブラウザ側のテストを実行できません: ${browser.error ?? 'テストが見つかりません'}`);
    return;
  }
  const nodeStatus = (name: string): string | undefined => {
    const result = node.tests.get(name)?.result;
    return result === undefined ? undefined : result === 'green' ? 'pass' : result === 'red' ? 'fail' : result;
  };
  const browserByName = new Map(browser.tests.map((test) => [test.name, test]));
  let mismatches = 0;
  for (const name of new Set([...node.tests.keys(), ...browserByName.keys()])) {
    const expected = nodeStatus(name);
    const actual = browserByName.get(name)?.status;
    if (expected !== actual) {
      mismatches += 1;
      errors.push(`${dir}: 「${name}」は Node で ${expected ?? '未実行'}、ブラウザ側で ${actual ?? '未実行'} です`);
      continue;
    }
    const nodeMessage = node.tests.get(name)?.message;
    const browserMessage = browserByName.get(name)?.message;
    if (actual === 'fail' && nodeMessage !== browserMessage) {
      notes.push(
        `${dir}: 「${name}」の失敗メッセージが違います\n    Node: ${JSON.stringify(nodeMessage)}\n    ブラウザ: ${
          JSON.stringify(browserMessage)
        }`,
      );
    }
  }
  const nodeSummary = counts([...node.tests.keys()].map((name) => nodeStatus(name) ?? ''));
  const browserSummary = counts(browser.tests.map((test) => test.status));
  const nodeFailed = node.status !== 0;
  const browserFailed = browser.tests.some((test) => test.status === 'fail');
  if (nodeFailed !== browserFailed) {
    errors.push(`${dir}: 失敗の有無が違います（Node の終了コード ${node.status}）`);
  }
  console.log(
    `${dir}: テスト Node ${nodeSummary} / ブラウザ ${browserSummary} ${
      mismatches === 0 && nodeSummary === browserSummary ? '一致' : '不一致'
    }`,
  );
};

const checkScript = async (dir: string, script: string, files: Record<string, string>): Promise<void> => {
  const node = spawnSync(process.execPath, ['--no-warnings', script], {
    cwd: join(exercisesDir, dir),
    encoding: 'utf8',
  });
  const browser = await runCode({ SQL, files, entry: script });
  const browserStdout = browser.logs.filter((line) => line.stream === 'stdout').map((line) => line.text).join('\n');
  const label = `${dir}/${script}`;
  if (node.status !== 0 || browser.error !== null) {
    const message = browser.error?.replace(/^[A-Za-z]*Error: /, '') ?? '';
    if (node.status !== 0 && browser.error !== null && node.stderr.includes(message)) {
      console.log(`${label}: 両方とも同じエラーで終了（${message}）`);
    } else {
      errors.push(
        `${label}: 実行結果の成否が違います（Node の終了コード ${node.status}、ブラウザ側 ${browser.error ?? '成功'}）`,
      );
    }
    return;
  }
  if (normalize(node.stdout) === normalize(browserStdout)) {
    console.log(`${label}: 出力 一致（${normalize(node.stdout).split('\n').length} 行）`);
    return;
  }
  errors.push(
    `${label}: 出力が違います\n--- Node\n${normalize(node.stdout)}\n--- ブラウザ\n${normalize(browserStdout)}`,
  );
};

const snapshots = readdirSync(exercisesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('chapter-'))
  .map((entry) => entry.name)
  .sort();

for (const dir of snapshots) {
  const files = readFiles(dir);
  await checkTests(dir, files);
  for (const script of Object.keys(files).filter((file) => !sharedFiles.has(file))) {
    await checkScript(dir, script, files);
  }
}

if (notes.length > 0) {
  console.log(`\n失敗メッセージの違い（参考）: ${notes.length} 件`);
  console.log(notes.join('\n'));
}
if (errors.length > 0) {
  console.error(`\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`\n${snapshots.length} 個のスナップショットすべてで、Node とブラウザ側の結果が一致しました`);
