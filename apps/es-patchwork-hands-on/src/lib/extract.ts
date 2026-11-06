export const extractLines = (source: string, startPrefix: string, endPrefix: string): string => {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(startPrefix));
  if (start === -1) {
    throw new Error(`切り出しの開始行が見つかりません: ${startPrefix}`);
  }
  const end = lines.findIndex((line, index) => index >= start && line.startsWith(endPrefix));
  if (end === -1) {
    throw new Error(`切り出しの終了行が見つかりません: ${endPrefix}`);
  }
  return lines.slice(start, end + 1).join('\n');
};

export const extractExport = (source: string, name: string): string =>
  extractLines(source, `export const ${name} =`, '};');

const blanks: readonly (readonly [string, string])[] = [
  [`      'VisitCancelled',`, '      /* event_name */,'],
  ['      input.visitId,', '      /* aggregate_id */,'],
  [`      'Visit',`, '      /* aggregate_name */,'],
  ['      JSON.stringify(cancelled),', '      /* aggregate_props */,'],
];

export const toInsertTemplate = (stepOneSource: string): string => {
  const answer = extractLines(stepOneSource, '    const cancelled =', '    );');
  return blanks.reduce((template, [line, blank]) => {
    if (!template.split('\n').includes(line)) {
      throw new Error(`雛形にする行が見つかりません: ${line}`);
    }
    return template.split('\n').map((current) => (current === line ? blank : current)).join('\n');
  }, answer);
};
