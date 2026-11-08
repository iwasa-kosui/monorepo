import { describe, expect, it } from 'vitest';

import { shouldResetPreview } from './markdownEditorPreview.ts';

describe('shouldResetPreview', () => {
  it('resets when the value becomes empty', () => {
    expect(shouldResetPreview('')).toBe(true);
  });

  it('does not reset while the value has text', () => {
    expect(shouldResetPreview('hello')).toBe(false);
  });

  it('does not reset for whitespace only', () => {
    expect(shouldResetPreview(' ')).toBe(false);
  });
});
