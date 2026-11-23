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

export const extractFrom = (source: string, startPrefix: string): string => {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(startPrefix));
  if (start === -1) {
    throw new Error(`切り出しの開始行が見つかりません: ${startPrefix}`);
  }
  return lines.slice(start).join('\n').trimEnd();
};

export const tableBodyRows = (html: string): string[] => {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html);
  if (body === null) {
    throw new Error('表の本体が見つかりません');
  }
  return body[1]?.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
};

export const extractHtmlSection = (html: string, heading: string): string => {
  const section = html.split(/(?=<h2[\s>])/).find((part) => {
    const title = /^<h2[^>]*>(.*?)<\/h2>/s.exec(part)?.[1];
    return title === heading;
  });
  if (section === undefined) {
    throw new Error(`切り出す節が見つかりません: ${heading}`);
  }
  return section.trim();
};

const blanks: readonly (readonly [string, string])[] = [
  [`      'VisitCancelled',`, '      /* event_name */,'],
  ['      input.visitId,', '      /* target_id */,'],
  [`      'Visit',`, '      /* target_type */,'],
  ['      JSON.stringify(cancelled),', '      /* target_state */,'],
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
