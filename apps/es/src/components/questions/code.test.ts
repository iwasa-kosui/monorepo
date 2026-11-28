import { describe, expect, it } from 'vitest';

import { cancelVisitOf, snapshotFiles } from '../../lib/snapshots';
import { diffFiles } from '../../workspace/diff';
import { smallStartWithdrawn, storeRecording, storeWithdrawn } from './code';

describe('記録をやめる前後のコード', () => {
  it('ハンズオンの形は、演習の cancelVisit から行を削除しただけで、追加する行がない', () => {
    const diff = diffFiles(cancelVisitOf('chapter-2-step-2'), smallStartWithdrawn, 1000);
    expect(diff.added).toBe(0);
    expect(diff.deleted).toBeGreaterThanOrEqual(1);
  });

  it('イベント中心に書いた形は、保存する処理から業務イベントを書く1行を削除しただけで、追加する行がない', () => {
    const diff = diffFiles(storeRecording, storeWithdrawn, 1000);
    expect(diff.added).toBe(0);
    expect(diff.deleted).toBe(1);
  });

  it('イベント中心に書いた形の演習のコードは、記録している保存する処理を含む', () => {
    expect(snapshotFiles('chapter-2-event-centered')['visit-store.ts']).toContain(storeRecording);
  });
});
