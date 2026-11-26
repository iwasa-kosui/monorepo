import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderAgentContext } from '../../scripts/agent-context.ts';
import { buildSystemPrompt } from './prompt.ts';

const appDir = join(import.meta.dirname, '..', '..');

describe('固定の文脈', () => {
  it('演習のファイルから生成した内容と一致する（ずれたら pnpm --filter es run generate:agent-context）', () => {
    const generated = readFileSync(join(appDir, 'worker/agent/context.generated.ts'), 'utf8');
    expect(generated).toBe(renderAgentContext(appDir));
  });

  it('ステップごとに、課題と db.ts とテストをシステムプロンプトに入れる', () => {
    const first = buildSystemPrompt(1);
    expect(first).toContain('visit_cancellations');
    expect(first).toContain('CREATE TABLE visit_cancellations');
    expect(first).toContain('第2章 ステップ1');
    const second = buildSystemPrompt(2);
    expect(second).toContain('business_events');
    expect(second).toContain('CREATE TABLE business_events');
    expect(second).not.toContain('CREATE TABLE visit_cancellations');
  });

  it('システムプロンプトに、編集できるファイルと全文で返す決まりを書く', () => {
    const prompt = buildSystemPrompt(1);
    expect(prompt).toContain('編集できるのは `visits.ts` だけ');
    expect(prompt).toContain('ファイルの全文');
    expect(prompt).toContain('日本語で答えます');
  });

  it('システムプロンプトの大きさを、数千字の範囲に収める', () => {
    expect(buildSystemPrompt(1).length).toBeLessThan(9000);
    expect(buildSystemPrompt(2).length).toBeLessThan(9000);
  });
});
