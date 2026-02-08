import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { filterByInterest } from './filter.js';
import { formatMarkdown } from './formatter.js';
import { fetchFindyConference } from './sources/findyConference.js';
import { fetchFortee } from './sources/fortee.js';
import { CfpEntry } from './types.js';

const parseArgs = (args: string[]): { all: boolean; output: string } => {
  let all = false;
  let output = './output/cfps.md';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      all = true;
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[i + 1];
      i++;
    }
  }

  return { all, output };
};

const deduplicateEntries = (entries: readonly CfpEntry[]): readonly CfpEntry[] => {
  const seen = new Map<string, CfpEntry>();

  for (const entry of entries) {
    const key = normalizeForDedup(entry.conferenceName);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
    } else if (entry.cfpUrl && !existing.cfpUrl) {
      // CFP URLがある方を優先
      seen.set(key, entry);
    }
  }

  return [...seen.values()];
};

const normalizeForDedup = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[0-9]{4}/g, '');
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  console.log('CFP情報を取得中...');

  const results = await Promise.allSettled([
    fetchFortee(),
    fetchFindyConference(),
  ]);

  const allEntries: CfpEntry[] = [];
  const sourceNames = ['fortee', 'findy'] as const;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const sourceName = sourceNames[i];

    if (result.status === 'rejected') {
      console.error(`[${sourceName}] 取得失敗: ${result.reason}`);
      continue;
    }

    if (!result.value.ok) {
      console.error(`[${sourceName}] 取得失敗: ${result.value.err.message}`);
      continue;
    }

    const entries = result.value.val;
    console.log(`[${sourceName}] ${entries.length}件取得`);
    allEntries.push(...entries);
  }

  const deduplicated = deduplicateEntries(allEntries);
  console.log(`合計: ${deduplicated.length}件（重複除去後）`);

  const filtered = args.all ? deduplicated : filterByInterest(deduplicated);
  if (!args.all) {
    console.log(`フィルタ後: ${filtered.length}件`);
  }

  const markdown = formatMarkdown(filtered);

  const outputPath = resolve(args.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf-8');
  console.log(`出力: ${outputPath}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
