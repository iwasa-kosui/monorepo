import { describe, expect, it } from 'vitest';

import { currentGeneration, type GenerationRef, isStaleGeneration, startGeneration } from './generation.ts';

describe('generation', () => {
  it('treats the latest generation as fresh', () => {
    const ref: GenerationRef = { current: 0 };
    const generation = startGeneration(ref);

    expect(isStaleGeneration(ref, generation)).toBe(false);
  });

  it('treats a load-more response as stale when a reload started after it', () => {
    const ref: GenerationRef = { current: 0 };
    const loadMoreGeneration = currentGeneration(ref);

    startGeneration(ref);

    expect(isStaleGeneration(ref, loadMoreGeneration)).toBe(true);
  });

  it('treats an earlier reload as stale when a later reload started', () => {
    const ref: GenerationRef = { current: 0 };
    const first = startGeneration(ref);
    const second = startGeneration(ref);

    expect(isStaleGeneration(ref, first)).toBe(true);
    expect(isStaleGeneration(ref, second)).toBe(false);
  });

  it('keeps a load-more response fresh when no reload started in between', () => {
    const ref: GenerationRef = { current: 0 };
    startGeneration(ref);
    const loadMoreGeneration = currentGeneration(ref);

    expect(isStaleGeneration(ref, loadMoreGeneration)).toBe(false);
  });
});
