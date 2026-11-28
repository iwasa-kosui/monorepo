import { describe, expect, it } from 'vitest';

import { snapshotFiles } from '../../lib/snapshots';
import { countLines, locateTourRange } from '../../playground/tour';
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

  it('最初に開くタブは、編集できるファイルか読み取り専用のファイルのどれかである', () => {
    const { editable, readonly, opened = [] } = embed.playground;
    expect([...editable, ...readonly]).toEqual(expect.arrayContaining(opened));
  });

  it('ツアーの各ステップのファイルが、スナップショットにある', () => {
    const files = snapshotFiles(embed.playground.exercise);
    for (const step of embed.playground.tour?.steps ?? []) {
      expect(Object.keys(files), step.title).toContain(step.file);
    }
  });

  it('ツアーの各ステップの手がかりが、そのファイルにちょうど1回だけ現れる', () => {
    const files = snapshotFiles(embed.playground.exercise);
    for (const step of embed.playground.tour?.steps ?? []) {
      const source = files[step.file] ?? '';
      expect(step.anchor, step.title).not.toBe('');
      expect(source.split(step.anchor).length - 1, step.title).toBe(1);
    }
  });

  it('ツアーの各ステップの強調する範囲が、ファイルの行数に収まる', () => {
    const files = snapshotFiles(embed.playground.exercise);
    for (const step of embed.playground.tour?.steps ?? []) {
      const source = files[step.file] ?? '';
      const range = locateTourRange(source, step.anchor, step.lines);
      expect(range, step.title).not.toBeNull();
      expect(step.lines, step.title).toBeGreaterThanOrEqual(1);
      expect((range?.first ?? 0) + step.lines - 1, step.title).toBeLessThanOrEqual(countLines(source));
    }
  });

  it('ツアーの各ステップの題と本文が空ではなく、本文のバッククォートが対になっている', () => {
    for (const step of embed.playground.tour?.steps ?? []) {
      expect(step.title).not.toBe('');
      expect(step.body).not.toBe('');
      expect(step.body.split('`').length % 2, step.title).toBe(1);
    }
  });

  it('画面の題が空ではない', () => {
    expect(embed.title).not.toBe('');
  });
});
