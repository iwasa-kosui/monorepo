type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  attributes?: { type: string; name?: string }[];
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const roleOf: Readonly<Record<string, string>> = {
  table: 'table',
  thead: 'rowgroup',
  tbody: 'rowgroup',
  tfoot: 'rowgroup',
  tr: 'row',
  th: 'columnheader',
  td: 'cell',
};

const textOf = (node: HastNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('');

const childElements = (node: HastNode, tagName: string): HastNode[] =>
  (node.children ?? []).filter((child) => child.type === 'element' && child.tagName === tagName);

const headerLabels = (table: HastNode): string[] => {
  const head = childElements(table, 'thead')[0];
  const row = head === undefined ? undefined : childElements(head, 'tr')[0];
  if (row === undefined) return [];
  return (row.children ?? [])
    .filter((cell) => cell.type === 'element' && (cell.tagName === 'th' || cell.tagName === 'td'))
    .map((cell) => textOf(cell).trim());
};

const labelCells = (table: HastNode, labels: readonly string[]): void => {
  for (const body of childElements(table, 'tbody')) {
    for (const row of childElements(body, 'tr')) {
      let column = 0;
      for (const cell of row.children ?? []) {
        if (cell.type !== 'element' || (cell.tagName !== 'td' && cell.tagName !== 'th')) continue;
        const label = labels[column];
        if (cell.tagName === 'td' && label !== undefined && label !== '') {
          cell.properties = { ...cell.properties, 'data-label': label };
        }
        column += 1;
      }
    }
  }
};

const marker = 'data-alternatives-table';

const isMarked = (node: HastNode): boolean =>
  (node.type === 'element' && node.properties?.[marker] !== undefined)
  || (node.type === 'mdxJsxFlowElement' && (node.attributes ?? []).some((attribute) => attribute.name === marker));

const walk = (node: HastNode, inside: boolean): void => {
  const marked = inside || isMarked(node);
  if (marked && node.type === 'element' && node.tagName !== undefined) {
    const role = roleOf[node.tagName];
    if (role !== undefined) node.properties = { ...node.properties, role };
    if (node.tagName === 'table') {
      const labels = headerLabels(node);
      if (labels.length > 0) labelCells(node, labels);
    }
  }
  for (const child of node.children ?? []) walk(child, marked);
};

export const rehypeTableLabels = () => (tree: HastNode): void => {
  walk(tree, false);
};
