import { describe, expect, it } from 'vitest';

import { lessonFile } from '../lib/snapshots';
import {
  cancelInputSource,
  cancelReasons,
  defaultReason,
  operatorName,
  statusLabelOf,
  statusLabels,
  targetVisitId,
} from './cancel-form';

const evaluate = (source: string): unknown => {
  const body = source.replace('export const cancelInput =', 'return');
  return new Function(body)();
};

describe('cancelInputSource', () => {
  it('既定の理由では lessons/play-input.ts と同じ cancelInput の値を返す', () => {
    const lesson = lessonFile('play-input.ts')['play-input.ts'] ?? '';
    expect(evaluate(cancelInputSource(defaultReason))).toEqual(evaluate(lesson));
  });

  it('引用符や改行を含む理由も、1つの文字列リテラルとして埋め込む', () => {
    const reason = `飼い主の'都合'と"事情"\n次の行\\末尾`;
    const source = cancelInputSource(reason);
    expect(source.trimEnd().split('\n')).toHaveLength(1);
    expect(evaluate(source)).toEqual({ visitId: targetVisitId, reason, operatedBy: operatorName });
  });

  it('理由の選択肢の先頭を既定にする', () => {
    expect(cancelReasons).toEqual(['飼い主の都合', '来院前に回復したため']);
    expect(defaultReason).toBe(cancelReasons[0]);
  });
});

describe('statusLabelOf', () => {
  it('status を日本語のバッジの文言に対応させる', () => {
    expect(statusLabelOf('reserved')).toBe('予約済み');
    expect(statusLabelOf('checked_in')).toBe('受付済み');
    expect(statusLabelOf('completed')).toBe('診察済み');
    expect(statusLabelOf('cancelled')).toBe('キャンセル済み');
    expect(Object.keys(statusLabels)).toHaveLength(4);
  });

  it('未知の status はそのまま返す', () => {
    expect(statusLabelOf('unknown')).toBe('unknown');
  });
});
