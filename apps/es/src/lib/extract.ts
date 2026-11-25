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

export type TemplateBlank = { readonly line: string; readonly blank: string };

export type InsertTemplate = {
  readonly start: string;
  readonly end: string;
  readonly blanks: readonly TemplateBlank[];
};

const blankLine = (label: string): string => `      /* ${label} */,`;

// ステップ1の空欄は、呼び出し元が知っている2つ（誰が、なぜ）にする。
// ステップ2の空欄は、1つのテーブルにまとめるときに変わる3つ（出来事の名前、業務の情報、対象の種類）にする。
export const insertTemplates = {
  step1: {
    start: '    db.prepare(`',
    end: '    );',
    blanks: [
      { line: '      input.operatedBy,', blank: blankLine('誰が') },
      { line: '      input.reason,', blank: blankLine('なぜ') },
    ],
  },
  step2: {
    start: '    const cancelled = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(input.visitId);',
    end: '    );',
    blanks: [
      { line: `      'VisitCancelled',`, blank: blankLine('event_name') },
      {
        line: '      JSON.stringify({ reason: input.reason, operatedBy: input.operatedBy }),',
        blank: blankLine('payload'),
      },
      { line: `      'Visit',`, blank: blankLine('target_type') },
    ],
  },
} as const satisfies Record<string, InsertTemplate>;

export const blankLabelsOf = (template: InsertTemplate): string[] =>
  template.blanks.map(({ blank }) => blank.trim().replace(/,$/, ''));

export const blankValuesOf = (template: InsertTemplate): string[] =>
  template.blanks.map(({ line }) => line.trim().replace(/,$/, ''));

export const extractBlock = (source: string, startLine: string, endLine: string): string => {
  const lines = source.split('\n');
  const start = lines.indexOf(startLine);
  if (start === -1) {
    throw new Error(`切り出しの開始行が見つかりません: ${startLine}`);
  }
  const end = lines.indexOf(endLine, start);
  if (end === -1) {
    throw new Error(`切り出しの終了行が見つかりません: ${endLine}`);
  }
  return lines.slice(start, end + 1).join('\n');
};

export const toInsertTemplate = (answerSource: string, template: InsertTemplate): string => {
  const lines = extractBlock(answerSource, template.start, template.end).split('\n');
  for (const { line } of template.blanks) {
    if (!lines.includes(line)) {
      throw new Error(`雛形にする行が見つかりません: ${line}`);
    }
  }
  return lines.map((current) => template.blanks.find(({ line }) => line === current)?.blank ?? current).join('\n');
};
