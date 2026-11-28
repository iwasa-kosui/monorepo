import { describe, expect, it } from 'vitest';

import { snapshotFiles } from '../../lib/snapshots';
import { scenarioProblems } from '../../workspace/validate';
import { embeds } from './embeds';

describe.each(Object.entries(embeds))('埋め込み %s', (_id, embed) => {
  it('シナリオの検査で問題が 0 件である', () => {
    expect(scenarioProblems(embed.scenario)).toEqual([]);
  });

  it('編集できるファイル、読み取り専用のファイル、テストのファイルがすべてスナップショットにある', () => {
    const files = Object.keys(snapshotFiles(embed.playground.exercise));
    const { editable, readonly, testFile } = embed.playground;
    expect(files).toEqual(expect.arrayContaining([...editable, ...readonly, testFile]));
  });

  it('画面の題が空ではない', () => {
    expect(embed.title).not.toBe('');
  });
});
