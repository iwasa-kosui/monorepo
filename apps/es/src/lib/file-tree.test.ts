import { describe, expect, it } from 'vitest';

import { baseName, buildFileTree } from './file-tree';

describe('baseName', () => {
  it('パスの最後の部分を返す', () => {
    expect(baseName('src/domain/visit/visit.ts')).toBe('visit.ts');
  });

  it('スラッシュを含まないパスは、そのまま返す', () => {
    expect(baseName('visits.ts')).toBe('visits.ts');
  });
});

describe('buildFileTree', () => {
  it('サブフォルダがなければ、ファイルだけを名前の順に並べる', () => {
    const tree = buildFileTree(['visits.ts', 'db.ts', 'who-cancelled.ts']);
    expect(tree.dirs).toEqual([]);
    expect(tree.files).toEqual(['db.ts', 'visits.ts', 'who-cancelled.ts']);
  });

  it('同じ階層では、フォルダを先に、ファイルを後に、それぞれ名前の順で並べる', () => {
    const tree = buildFileTree([
      'visits.ts',
      'src/useCase/cancelVisit.ts',
      'db.ts',
      'src/adaptor/sqlite/eventRow.ts',
      'src/domain/visit/visit.ts',
      'src/domain/aggregate/event.ts',
    ]);
    expect(tree.files).toEqual(['db.ts', 'visits.ts']);
    expect(tree.dirs.map((dir) => dir.name)).toEqual(['src']);
    const [src] = tree.dirs;
    expect(src?.path).toBe('src');
    expect(src?.dirs.map((dir) => dir.name)).toEqual(['adaptor/sqlite', 'domain', 'useCase']);
    expect(src?.files).toEqual([]);
  });

  it('入れ子のフォルダは、ルートからのパスを持つ', () => {
    const tree = buildFileTree([
      'src/adaptor/sqlite/visit/visitResolver.ts',
      'src/adaptor/sqlite/eventRow.ts',
      'src/domain/visit/visit.ts',
    ]);
    const sqlite = tree.dirs[0]?.dirs[0];
    expect(sqlite?.path).toBe('src/adaptor/sqlite');
    expect(sqlite?.files).toEqual(['src/adaptor/sqlite/eventRow.ts']);
    expect(sqlite?.dirs[0]?.path).toBe('src/adaptor/sqlite/visit');
    expect(sqlite?.dirs[0]?.files).toEqual(['src/adaptor/sqlite/visit/visitResolver.ts']);
  });

  describe('サブフォルダが1つだけのフォルダの連なり', () => {
    it('ファイルを持たず、サブフォルダが1つだけのフォルダは、子とつないで1つにまとめる', () => {
      const tree = buildFileTree(['src/adaptor/sqlite/eventRow.ts', 'src/useCase/cancelVisit.ts']);
      const adaptor = tree.dirs[0]?.dirs[0];
      expect(adaptor?.name).toBe('adaptor/sqlite');
      expect(adaptor?.path).toBe('src/adaptor/sqlite');
      expect(adaptor?.dirs).toEqual([]);
      expect(adaptor?.files).toEqual(['src/adaptor/sqlite/eventRow.ts']);
    });

    it('3つ以上の連なりも、1つにまとめる', () => {
      const tree = buildFileTree(['a/b/c/d/file.ts', 'top.ts']);
      expect(tree.dirs).toHaveLength(1);
      expect(tree.dirs[0]?.name).toBe('a/b/c/d');
      expect(tree.dirs[0]?.path).toBe('a/b/c/d');
      expect(tree.dirs[0]?.files).toEqual(['a/b/c/d/file.ts']);
    });

    it('まとめたフォルダの下に、サブフォルダが続く', () => {
      const tree = buildFileTree(['a/b/c/x.ts', 'a/b/c/d/y.ts', 'a/b/c/e/z.ts']);
      const [merged] = tree.dirs;
      expect(merged?.name).toBe('a/b/c');
      expect(merged?.dirs.map((dir) => dir.name)).toEqual(['d', 'e']);
    });

    it('ファイルを持つフォルダは、子とまとめない', () => {
      const tree = buildFileTree(['src/index.ts', 'src/adaptor/eventRow.ts']);
      const [src] = tree.dirs;
      expect(src?.name).toBe('src');
      expect(src?.dirs.map((dir) => dir.name)).toEqual(['adaptor']);
    });

    it('サブフォルダを2つ持つフォルダは、まとめない', () => {
      const tree = buildFileTree(['src/adaptor/a.ts', 'src/domain/b.ts']);
      expect(tree.dirs[0]?.name).toBe('src');
      expect(tree.dirs[0]?.dirs.map((dir) => dir.name)).toEqual(['adaptor', 'domain']);
    });

    it('ルートの直下にあるフォルダだけの連なりは、まとめる。ルート自身は、まとめない', () => {
      const tree = buildFileTree(['src/domain/visit.ts']);
      expect(tree.files).toEqual([]);
      expect(tree.dirs.map((dir) => dir.name)).toEqual(['src/domain']);
    });
  });
});
