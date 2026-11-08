import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const exercisesDir = join(import.meta.dirname, '..', 'exercises');
const reporter = join(import.meta.dirname, 'json-lines-reporter.ts');

const existing = [
  '予約した来院をキャンセルすると、来院の状態がキャンセルになる',
  '診察が終わった来院はキャンセルできない',
  'キャンセルできなかったときは、記録を残さない',
  '来院の更新に失敗したら、記録も残らない',
];
const step1 = [
  '来院をキャンセルすると、来院キャンセルの記録が1行残る',
  'キャンセルの記録に、キャンセル後の来院の状態が残る',
  '記録に失敗したら、来院のキャンセルも失敗する',
];
const step2 = ['キャンセルした人と理由を答えられる'];

const snapshots = [
  { dir: 'chapter-1-start', green: existing, red: [...step1, ...step2] },
  { dir: 'chapter-2-step-1', green: [...existing, ...step1], red: step2 },
  { dir: 'chapter-2-step-2', green: [...existing, ...step1, ...step2], red: [] },
];

const chapter4 = [
  {
    pattern: 'summary-table',
    script: 'why-this-count.ts',
    outputs: ['飼い主の都合', '来院前に回復したため', '院長'],
    existing: [
      ...existing,
      ...step1,
      ...step2,
      'キャンセルすると、その診察日のキャンセル数が1増える',
      'キャンセル数の更新に失敗したら、来院のキャンセルも記録も残らない',
    ],
    tests: [
      'キャンセル数の内訳を、業務イベントから理由と操作者つきで答えられる',
      '別の診察日のキャンセルは内訳に含まれない',
      '業務イベントからの再計算が、キャンセル数と一致する',
      '業務イベントを通らずに書き換えたキャンセル数は、業務イベントから数え直した数との差として分かる',
      '業務イベントの導入前から残っているキャンセル数は、業務イベントから数え直した数との差として分かる',
    ],
  },
  {
    pattern: 'external-sync',
    script: 'what-was-sent.ts',
    outputs: ['飼い主の都合', 'sent', 'failed', 'unconfirmed', '送信先に接続できません'],
    existing: [
      ...existing,
      ...step1,
      ...step2,
      'キャンセルすると、予約リマインドの取消を送る',
      '送信に失敗しても、来院のキャンセルは取り消されない',
      '来院の更新に失敗したら、予約リマインドの取消を送らない',
    ],
    tests: [
      '外部システムへ送った内容と時刻を、キャンセルの理由と一緒に答えられる',
      '送信に失敗したら、失敗の理由が記録に残る',
      '送信の予定を記録できなければ、来院のキャンセルも外部への送信もしない',
      '送信後の記録に失敗したら、結果が未確認の送信として分かる',
    ],
  },
  {
    pattern: 'audit-log',
    script: 'why-changed.ts',
    outputs: ['飼い主の都合', 'VisitCancelled', 'visit-3', 'completed'],
    existing: [
      ...existing,
      ...step1,
      ...step2,
      'キャンセルすると、監査ログに変更前後の値と操作者が残る',
      '診察を終えると、監査ログに変更前後の値と操作者が残る',
      '監査ログの記録に失敗したら、来院のキャンセルも失敗する',
    ],
    tests: [
      '監査ログの変更から、キャンセルの業務上の理由を答えられる',
      '同じ変更でも、理由が違えば業務イベントで見分けられる',
      '業務イベントのない変更は、理由が無い変更として分かる',
      '業務イベントの payload は変更前後の値を持たず、監査ログへの参照で結びつく',
    ],
  },
];

const errors: string[] = [];

const checkTests = (dir: string, green: string[], red: string[]): void => {
  const result = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, 'visits.test.ts'], {
    cwd: join(exercisesDir, dir),
    encoding: 'utf8',
  });
  const actual = new Map<string, string>(
    result.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const { name, result: outcome } = JSON.parse(line);
      return [name, outcome];
    }),
  );
  const expected = new Map<string, string>([
    ...green.map((name): [string, string] => [name, 'green']),
    ...red.map((name): [string, string] => [name, 'red']),
  ]);
  for (const name of new Set([...expected.keys(), ...actual.keys()])) {
    if (expected.get(name) !== actual.get(name)) {
      errors.push(
        `${dir}: 「${name}」は ${expected.get(name) ?? '想定外'} のはずですが、${actual.get(name) ?? '未実行'} です`,
      );
    }
  }
  if ((result.status === 0) !== (red.length === 0)) {
    errors.push(`${dir}: node --test の終了コードが想定と違います（${result.status}）`);
  }
  console.log(`${dir}: green ${green.length} / red ${red.length} を想定`);
};

const runScript = (dir: string, script: string) =>
  spawnSync(process.execPath, [script], { cwd: join(exercisesDir, dir), encoding: 'utf8' });

const sharedFiles = (dir: string) =>
  readdirSync(join(exercisesDir, dir)).filter((file) => file !== 'visits.ts' && !file.startsWith('.')).sort();

const checkSharedFiles = (base: string, others: string[]): void => {
  for (const other of others) {
    if (sharedFiles(base).join() !== sharedFiles(other).join()) {
      errors.push(`${other}: ${base} とファイルの一覧が違います`);
    }
    for (const file of sharedFiles(base)) {
      const baseText = readFileSync(join(exercisesDir, base, file), 'utf8');
      const otherPath = join(exercisesDir, other, file);
      if (sharedFiles(other).includes(file) && baseText !== readFileSync(otherPath, 'utf8')) {
        errors.push(`${other}/${file}: ${base} と内容が違います`);
      }
    }
  }
};

for (const { dir, green, red } of snapshots) {
  checkTests(dir, green, red);
  const who = runScript(dir, 'who-cancelled.ts');
  if (who.status !== 0) {
    errors.push(`${dir}: who-cancelled.ts の終了コードが 0 ではありません（${who.status}）`);
  }
  if (dir === 'chapter-2-step-2') {
    for (const text of ['受付スタッフ', '飼い主の都合', 'visit-tama']) {
      if (!who.stdout.includes(text)) {
        errors.push(`${dir}: who-cancelled.ts の出力に「${text}」がありません`);
      }
    }
  } else if (who.stdout.includes('受付スタッフ')) {
    errors.push(`${dir}: who-cancelled.ts の出力に「受付スタッフ」が含まれています`);
  }
  const show = runScript(dir, 'show-visits.ts');
  if (show.status !== 0) {
    errors.push(`${dir}: show-visits.ts の終了コードが 0 ではありません（${show.status}）`);
  }
  if (!show.stdout.includes('cancelled')) {
    errors.push(`${dir}: show-visits.ts の出力に「cancelled」がありません`);
  }
  for (const text of ['受付スタッフ', '飼い主の都合']) {
    if (show.stdout.includes(text)) {
      errors.push(`${dir}: show-visits.ts の出力に「${text}」が含まれています`);
    }
  }
}

const [base, ...others] = snapshots.map(({ dir }) => dir);
checkSharedFiles(base, others);

for (const { pattern, script, outputs, existing: green, tests } of chapter4) {
  const start = `chapter-4-${pattern}-start`;
  const done = `chapter-4-${pattern}-done`;
  checkTests(start, green, tests);
  checkTests(done, [...green, ...tests], []);
  checkSharedFiles(start, [done]);
  const result = runScript(done, script);
  if (result.status !== 0) {
    errors.push(`${done}: ${script} の終了コードが 0 ではありません（${result.status}）`);
  }
  for (const text of outputs) {
    if (!result.stdout.includes(text)) {
      errors.push(`${done}: ${script} の出力に「${text}」がありません`);
    }
  }
}

const listed = new Set([
  ...snapshots.map(({ dir }) => dir),
  ...chapter4.flatMap(({ pattern }) => [`chapter-4-${pattern}-start`, `chapter-4-${pattern}-done`]),
]);
for (const entry of readdirSync(exercisesDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith('chapter-') && !listed.has(entry.name)) {
    errors.push(`${entry.name}: 検査の表に載っていません`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('すべてのスナップショットが想定どおりです');
