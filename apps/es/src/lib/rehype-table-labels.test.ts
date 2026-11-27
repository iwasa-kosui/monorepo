import { describe, expect, it } from 'vitest';

import { rehypeTableLabels } from './rehype-table-labels';

type Node = Parameters<ReturnType<typeof rehypeTableLabels>>[0];

const text = (value: string): Node => ({ type: 'text', value });
const el = (tagName: string, children: Node[] = []): Node => ({
  type: 'element',
  tagName,
  properties: {},
  children,
});
const cell = (tagName: 'th' | 'td', ...children: Node[]): Node => el(tagName, children);

const tableOf = (head: Node[] | undefined, rows: Node[][]): Node =>
  el('table', [
    ...(head === undefined ? [] : [el('thead', [el('tr', head)])]),
    el('tbody', rows.map((row) => el('tr', row))),
  ]);

const marked = (...children: Node[]): Node => ({
  type: 'mdxJsxFlowElement',
  attributes: [{ type: 'mdxJsxAttribute', name: 'data-alternatives-table' }],
  children,
});

const run = (tree: Node): Node => {
  rehypeTableLabels()(tree);
  return tree;
};

const bodyCells = (table: Node): Node[] =>
  (table.children ?? []).find((child) => child.tagName === 'tbody')?.children?.flatMap((row) => row.children ?? [])
    ?? [];

describe('rehypeTableLabels', () => {
  it('見出しの文字を本体の各セルの data-label に入れる', () => {
    const table = tableOf([cell('th', text('案')), cell('th', text('記録が欠落しない'))], [
      [cell('td', text('ログに出力する')), cell('td', text('×'))],
    ]);
    run(el('root', [marked(table)]));
    expect(bodyCells(table).map((c) => c.properties?.['data-label'])).toEqual(['案', '記録が欠落しない']);
  });

  it('見出しのセルがインラインコードを含むときは文字だけを連結する', () => {
    const table = tableOf(
      [cell('th', text('案')), cell('th', el('code', [text('visits')]), text(' を変更しない'))],
      [[cell('td', text('A')), cell('td', text('○'))]],
    );
    run(el('root', [marked(table)]));
    expect(bodyCells(table)[1]?.properties?.['data-label']).toBe('visits を変更しない');
  });

  it('table、行のまとまり、行、セルに role を付ける', () => {
    const table = tableOf([cell('th', text('案'))], [[cell('td', text('A'))]]);
    run(el('root', [marked(table)]));
    const [head, body] = table.children ?? [];
    expect(table.properties?.role).toBe('table');
    expect(head?.properties?.role).toBe('rowgroup');
    expect(body?.properties?.role).toBe('rowgroup');
    expect(head?.children?.[0]?.properties?.role).toBe('row');
    expect(head?.children?.[0]?.children?.[0]?.properties?.role).toBe('columnheader');
    expect(bodyCells(table)[0]?.properties?.role).toBe('cell');
  });

  it('見出しの無い表には data-label を付けない', () => {
    const table = tableOf(undefined, [[cell('td', text('A')), cell('td', text('B'))]]);
    run(el('root', [marked(table)]));
    expect(bodyCells(table).map((c) => c.properties?.['data-label'])).toEqual([undefined, undefined]);
  });

  it('印の無い表は変更しない', () => {
    const table = tableOf([cell('th', text('案'))], [[cell('td', text('A'))]]);
    run(el('root', [table]));
    expect(table.properties).toEqual({});
    expect(bodyCells(table)[0]?.properties).toEqual({});
  });
});
