import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { lessonPages, pageFlows } from './lesson-pages';

const entryIds = readdirSync(new URL('./content/chapters/', import.meta.url), { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.mdx'))
  .map((path) => path.replaceAll('\\', '/').replace(/\.mdx$/, ''))
  .sort();

describe('lessonPages', () => {
  it('章ページの MDX と同じページを過不足なく持つ', () => {
    expect(Object.keys(lessonPages).sort()).toEqual(entryIds);
  });

  it.each(Object.entries(lessonPages))('%s の最初の状態は、聞くか手を動かすかのどちらか', (_, page) => {
    expect(['listen', 'do']).toContain(page.mode);
  });

  it.each(Object.entries(lessonPages))(
    '%s の役割の行は1文で、見出し語から始めず、バッククォートが対になっている',
    (_, page) => {
      expect(page.role).toMatch(/^[^。]+。$/);
      expect(page.role.split('`').length % 2).toBe(1);
      expect(Object.values(pageFlows).filter((label) => page.role.startsWith(label))).toEqual([]);
    },
  );
});
