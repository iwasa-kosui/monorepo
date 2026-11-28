import { describe, expect, it } from 'vitest';

import { backdropOf } from './full-view';

type Node = {
  readonly name: string;
  parentElement: Node | null;
  readonly children: Node[];
};

const node = (name: string, ...children: Node[]): Node => {
  const made: Node = { name, parentElement: null, children };
  for (const child of children) child.parentElement = made;
  return made;
};

const names = (nodes: readonly Node[]): string[] => nodes.map((item) => item.name);

describe('backdropOf', () => {
  it('枠の直下にあるときは、同じ階層の兄弟を返す', () => {
    const root = node('scene');
    const frame = node('main', node('heading'), root, node('note'));
    expect(names(backdropOf(root, frame))).toEqual(['heading', 'note']);
  });

  it('深い階層にあるときは、枠までの各階層の兄弟を返す', () => {
    const root = node('scene');
    const article = node('article', node('heading'), root);
    const frame = node('main', article, node('aside'));
    expect(names(backdropOf(root, frame))).toEqual(['heading', 'aside']);
  });

  it('枠の外の要素は返さない', () => {
    const root = node('scene');
    const frame = node('main', root);
    node('page', node('bar'), frame);
    expect(backdropOf(root, frame)).toEqual([]);
  });

  it('枠の中に無いときは何も返さない', () => {
    const root = node('scene');
    node('other', root, node('sibling'));
    expect(backdropOf(root, node('main'))).toEqual([]);
  });
});
