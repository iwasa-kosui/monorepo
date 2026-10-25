import { describe, expect, it } from 'vitest';

import { PostContent } from '../postContent.ts';

describe('PostContent.fromMarkdown', () => {
  it('highlights a fenced code block with dual themes', async () => {
    const html = await PostContent.fromMarkdown('```typescript\nconst answer: number = 42;\n```');

    expect(html).toContain('<pre class="shiki shiki-themes rose-pine-dawn rose-pine"');
    expect(html).toContain('--shiki-dark:');
    expect(html).toContain('answer');
  });

  it('falls back to plaintext for an unsupported language', async () => {
    const html = await PostContent.fromMarkdown('```unknownlang\nhello\n```');

    expect(html).toContain('<pre class="shiki shiki-themes rose-pine-dawn rose-pine"');
    expect(html).toContain('hello');
  });
});
