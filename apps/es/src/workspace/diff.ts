export type DiffKind = 'same' | 'add' | 'del';

export type DiffLine = {
  readonly kind: DiffKind;
  readonly text: string;
  readonly oldNumber: number | undefined;
  readonly newNumber: number | undefined;
};

export type DiffHunk = {
  readonly header: string;
  readonly lines: readonly DiffLine[];
};

export type FileDiff = {
  readonly added: number;
  readonly deleted: number;
  readonly hunks: readonly DiffHunk[];
};

const linesOf = (source: string): string[] => {
  const trimmed = source.endsWith('\n') ? source.slice(0, -1) : source;
  return trimmed === '' ? [] : trimmed.split('\n');
};

const editScript = (before: readonly string[], after: readonly string[]): DiffLine[] => {
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = before[i] === after[j]
        ? (table[(i + 1) * width + j + 1] ?? 0) + 1
        : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const script: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const left = before[i];
    const right = after[j];
    if (left !== undefined && right !== undefined && left === right) {
      script.push({ kind: 'same', text: left, oldNumber: i + 1, newNumber: j + 1 });
      i += 1;
      j += 1;
    } else if (
      left !== undefined
      && (right === undefined || (table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0))
    ) {
      script.push({ kind: 'del', text: left, oldNumber: i + 1, newNumber: undefined });
      i += 1;
    } else if (right !== undefined) {
      script.push({ kind: 'add', text: right, oldNumber: undefined, newNumber: j + 1 });
      j += 1;
    }
  }
  return script;
};

const hunksOf = (script: readonly DiffLine[], context: number): DiffHunk[] => {
  const changed = script.flatMap((line, index) => (line.kind === 'same' ? [] : [index]));
  const ranges: [number, number][] = [];
  for (const index of changed) {
    const from = Math.max(0, index - context);
    const to = Math.min(script.length - 1, index + context);
    const last = ranges.at(-1);
    if (last !== undefined && from <= last[1] + 1) {
      last[1] = Math.max(last[1], to);
    } else {
      ranges.push([from, to]);
    }
  }
  return ranges.map(([from, to]) => {
    const lines = script.slice(from, to + 1);
    const oldLines = lines.filter((line) => line.kind !== 'add');
    const newLines = lines.filter((line) => line.kind !== 'del');
    const oldStart = oldLines[0]?.oldNumber ?? 0;
    const newStart = newLines[0]?.newNumber ?? 0;
    return { header: `@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`, lines };
  });
};

export const diffFiles = (before: string, after: string, context = 3): FileDiff => {
  const script = editScript(linesOf(before), linesOf(after));
  return {
    added: script.filter((line) => line.kind === 'add').length,
    deleted: script.filter((line) => line.kind === 'del').length,
    hunks: hunksOf(script, context),
  };
};
