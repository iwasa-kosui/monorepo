import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appDir = join(import.meta.dirname, '..', '..');
const read = (file: string): string => readFileSync(join(appDir, file), 'utf8');
const squash = (text: string): string => text.replace(/\s+/g, '').replace(/,([}\]])/g, '$1');

describe('wrangler の設定', () => {
  it('本番用の設定は、Workers AI のバインディングと、/api/* を先に Worker へ渡す設定を持つ', () => {
    const config = squash(read('wrangler.jsonc'));
    expect(config).toContain('"ai":{"binding":"AI"}');
    expect(config).toContain('"run_worker_first":["/healthz","/api/*"]');
    expect(config).toContain('"name":"AGENT_RATE_LIMIT"');
    expect(config).toContain('"name":"AGENT_AUTH_FAILURE_LIMIT"');
  });

  it('開発用の設定は、Workers AI のバインディングを除いて本番用と同じ', () => {
    const production = squash(read('wrangler.jsonc')).replace('"ai":{"binding":"AI"},', '');
    expect(squash(read('wrangler.dev.jsonc'))).toBe(production);
  });

  it('パスワードの値を設定ファイルと例のファイルに書かない', () => {
    expect(read('wrangler.jsonc')).not.toContain('AGENT_PASSWORD');
    expect(read('wrangler.dev.jsonc')).not.toContain('AGENT_PASSWORD');
    expect(read('.dev.vars.example')).toMatch(/^AGENT_PASSWORD=ここに/);
  });
});
