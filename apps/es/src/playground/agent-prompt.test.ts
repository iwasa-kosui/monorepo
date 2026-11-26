import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildLocalAgentPrompt } from './agent-prompt.ts';
import { taskSentencesOf } from './agent-task.ts';

const appDir = join(import.meta.dirname, '..', '..');
const read = (path: string): string => readFileSync(join(appDir, path), 'utf8');
const origin = 'https://es.example.com';

const squash = (text: string): string => text.replace(/<[^>]+>/g, '').replace(/[`\s]/g, '');

describe('手元のコーディングエージェント用のプロンプト', () => {
  const setup = read('src/pages/setup.astro');

  it.each(
    [
      [1, 'chapter-1-start'],
      [2, 'chapter-2-step-2-start'],
    ] as const,
  )('ステップ%i は、演習のディレクトリと setup.astro と同じコマンドを書く', (step, directory) => {
    const prompt = buildLocalAgentPrompt(step, origin);
    expect(existsSync(join(appDir, 'exercises', directory, 'visits.ts'))).toBe(true);
    expect(prompt).toContain(`curl -LO ${origin}/es-patchwork-exercises.tar.gz`);
    expect(prompt).toContain('tar -xf es-patchwork-exercises.tar.gz');
    expect(prompt).toContain(`cd es-patchwork-exercises/${directory}`);
    expect(prompt).toContain('node --test visits.test.ts');
    expect(setup).toContain('href="/es-patchwork-exercises.tar.gz"');
    expect(setup).toContain('tar -xf es-patchwork-exercises.tar.gz');
    expect(setup).toContain('cd es-patchwork-exercises/chapter-1-start');
    expect(setup).toContain('node --test visits.test.ts');
  });

  it('配布物の名前と展開先のディレクトリ名が、配布物を作るスクリプトと一致する', () => {
    const script = read('scripts/build-exercises-tarball.ts');
    expect(script).toContain('\'dist\', \'es-patchwork-exercises.tar.gz\'');
    expect(script).toContain('\'es-patchwork-exercises\'');
  });

  it('Node のバージョン要件が、setup.astro と演習の package.json に一致する', () => {
    const prompt = buildLocalAgentPrompt(1, origin);
    expect(prompt).toContain('Node.js 24.12.0 以上');
    expect(setup).toContain('Node.js 24.12.0 以上を入れる');
    expect(read('exercises/package.json')).toContain('>=24.12.0');
  });

  it('編集するのは visits.ts だけで、db.ts とテストは変更しないと書く', () => {
    for (const step of [1, 2] as const) {
      expect(buildLocalAgentPrompt(step, origin)).toContain(
        '編集するのは `visits.ts` だけです。`db.ts` とテストは変更しないでください。',
      );
    }
  });

  it('完了条件は pass 8 と fail 0', () => {
    for (const step of [1, 2] as const) {
      expect(buildLocalAgentPrompt(step, origin)).toContain(
        `\`node --test visits.test.ts\` の結果に \`pass 8\` と \`fail 0\` が出れば、ステップ${step}は完了です。`,
      );
    }
  });

  it('ステップ1は chapter-1-start、ステップ2は chapter-2-step-2-start の作業ディレクトリを使う', () => {
    expect(buildLocalAgentPrompt(1, origin)).not.toContain('chapter-2-step-2-start');
    expect(buildLocalAgentPrompt(2, origin)).not.toContain('chapter-1-start');
  });

  it('プロンプトに製品名を書かない', () => {
    for (const step of [1, 2] as const) {
      expect(buildLocalAgentPrompt(step, origin).toLowerCase()).not.toMatch(
        /cloudflare|workers ai|claude|openai|deepseek/,
      );
    }
  });

  it('課題の文は、ヒント1の文面と、ページ本文にある文から取る', () => {
    const scene = squash(read('src/components/AddRecordScene.astro'));
    for (const step of [1, 2] as const) {
      for (const sentence of taskSentencesOf(step)) {
        expect(scene, sentence).toContain(squash(sentence));
      }
    }
    expect(scene).toContain(
      squash('このディレクトリの `db.ts` とテストは、`business_events` 用です。`visits.ts` はステップ1の解答です。'),
    );
    expect(scene).toContain(squash('`pass 8` と `fail 0` が出れば、ステップ1は完了です。'));
    expect(scene).toContain(squash('`pass 8` と `fail 0` が出れば、ステップ2は完了です。'));
  });
});
