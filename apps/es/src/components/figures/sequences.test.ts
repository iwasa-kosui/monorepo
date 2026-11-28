import { describe, expect, it } from 'vitest';

import { cancelRecordOptions } from '../adr/adr-options';
import type { Sequence } from './sequences';
import * as all from './sequences';
import { cancelDecisionSequence } from './sequences';

const sequences: readonly Sequence[] = Object.values(all).filter(
  (value): value is Sequence => typeof value === 'object' && value !== null && 'lanes' in value,
);

describe('シーケンスの図のデータ', () => {
  it.each(sequences.map((sequence) => [sequence.id, sequence] as const))(
    '%s は、レーンの識別子が重複せず、手順が存在するレーンだけを指し、枠が手順の範囲に収まる',
    (_, sequence) => {
      const ids = sequence.lanes.map((lane) => lane.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(sequence.label).not.toBe('');
      for (const step of sequence.steps) {
        if (step.type === 'message') {
          expect(ids).toContain(step.from);
          expect(ids).toContain(step.to);
        }
        if (step.type === 'note') expect(ids).toContain(step.lane);
      }
      if (sequence.frame !== undefined) {
        expect(sequence.frame.from).toBeGreaterThanOrEqual(0);
        expect(sequence.frame.to).toBeLessThan(sequence.steps.length);
        expect(sequence.frame.from).toBeLessThanOrEqual(sequence.frame.to);
      }
    },
  );

  it('図の識別子は、すべて異なる', () => {
    const ids = sequences.map((sequence) => sequence.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ADR 1 の 6 つの案は、すべて図を持ち、6 つすべての図が、欠点や評価を示す吹き出しを含まない', () => {
    expect(cancelRecordOptions).toHaveLength(6);
    for (const option of cancelRecordOptions) {
      expect(sequences, option.id).toContain(option.sequence);
      for (const step of option.sequence.steps) {
        if (step.type === 'divider') continue;
        expect(step.callout, option.id).toBeUndefined();
      }
    }
  });

  it('ADR 1 の 6 つの案の図の枠のラベルは、すべて「トランザクション」の書き方にそろう', () => {
    for (const option of cancelRecordOptions) {
      const label = option.sequence.frame?.label;
      if (label === undefined) continue;
      expect(label, option.id).toBe('トランザクション');
    }
  });

  it('採用案の図は、決定の節の図と同じ流れで、吹き出しと「同じトランザクション」の枠のラベルだけが異なる', () => {
    const adopted = cancelRecordOptions.find((option) => option.adopted === true);
    if (adopted === undefined) throw new Error('採用案がありません');
    expect(adopted.sequence).not.toBe(cancelDecisionSequence);
    expect(adopted.sequence.lanes).toEqual(cancelDecisionSequence.lanes);
    const flow = (sequence: Sequence) =>
      sequence.steps.flatMap((step) =>
        step.type === 'message' ? [[step.from, step.to, step.text, step.style] as const] : []
      );
    expect(flow(adopted.sequence)).toEqual(flow(cancelDecisionSequence));
    expect(cancelDecisionSequence.frame?.label).toBe('同じトランザクション');
    expect(cancelDecisionSequence.steps.some((step) => step.type !== 'divider' && step.callout !== undefined)).toBe(
      true,
    );
    const last = adopted.sequence.steps.at(-1);
    expect(last).toEqual({ type: 'note', lane: 'records', text: 'コミット' });
    expect(adopted.sequence.frame).toEqual({
      label: 'トランザクション',
      from: 1,
      to: adopted.sequence.steps.length - 1,
    });
  });
});
