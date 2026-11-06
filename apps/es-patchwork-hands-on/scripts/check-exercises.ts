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

const errors: string[] = [];

for (const { dir, green, red } of snapshots) {
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
  const who = spawnSync(process.execPath, ['who-cancelled.ts'], { cwd: join(exercisesDir, dir), encoding: 'utf8' });
  if (who.status !== 0) {
    errors.push(`${dir}: who-cancelled.ts の終了コードが 0 ではありません（${who.status}）`);
  }
  if (dir === 'chapter-2-step-2') {
    for (const text of ['受付スタッフ', '飼い主の都合', 'visit-before-events']) {
      if (!who.stdout.includes(text)) {
        errors.push(`${dir}: who-cancelled.ts の出力に「${text}」がありません`);
      }
    }
  } else if (who.stdout.includes('受付スタッフ')) {
    errors.push(`${dir}: who-cancelled.ts の出力に「受付スタッフ」が含まれています`);
  }
  console.log(`${dir}: green ${green.length} / red ${red.length} を想定`);
}

const [base, ...others] = snapshots.map(({ dir }) => dir);
const sharedFiles = (dir: string) => readdirSync(join(exercisesDir, dir)).filter((file) => file !== 'visits.ts').sort();
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

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('すべてのスナップショットが想定どおりです');
