import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostMenu, type PostMenuItem } from './PostMenu.tsx';

type Tree = Readonly<{ tag: string; props: Record<string, unknown>; children: unknown }>;

const findAll = (node: unknown, predicate: (element: Tree) => boolean): Tree[] => {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (typeof node !== 'object' || node === null || !('tag' in node)) return [];
  const { tag, props, children } = node as { tag: unknown; props: Record<string, unknown>; children: unknown };
  if (typeof tag === 'function') return findAll(tag({ ...props, children }), predicate);
  const element = node as Tree;
  return [...(predicate(element) ? [element] : []), ...findAll(children, predicate)];
};

const trigger = (node: unknown): Tree => {
  const [button] = findAll(node, (element) => 'aria-controls' in element.props);
  if (button === undefined) throw new Error('trigger not found');
  return button;
};

const menu = (node: unknown): Tree | undefined => {
  const id = trigger(node).props['aria-controls'];
  return findAll(node, (element) => element.props.id === id)[0];
};

const focusTarget = (node: unknown): ReturnType<typeof vi.fn> => {
  const focus = vi.fn();
  (trigger(node).props.ref as { current: unknown }).current = { focus };
  return focus;
};

const container = (node: unknown): Tree => {
  const [element] = findAll(node, (candidate) => typeof candidate.props.onKeyDown === 'function');
  if (element === undefined) throw new Error('container not found');
  return element;
};

const menuItems = (node: unknown): Tree[] =>
  findAll(menu(node), (element) => element.tag === 'a' || element.tag === 'button');

const menuItem = (node: unknown, index: number): Tree => {
  const item = menuItems(node)[index];
  if (item === undefined) throw new Error('menuitem not found');
  return item;
};

const call = (element: Tree, name: string, event: unknown = {}): void =>
  (element.props[name] as (event: unknown) => void)(event);

const items: readonly PostMenuItem[] = [
  { key: 'open', label: '元の投稿を開く', kind: 'link', href: 'https://remote.example/notes/1' },
  { key: 'copy', label: 'リンクをコピー', kind: 'copy', text: 'https://remote.example/notes/1' },
  { key: 'mute', label: '@alice をミュート', kind: 'action', danger: true, onSelect: () => {} },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PostMenu', () => {
  it('トリガーを押すと、親要素にクリックを伝えない', () => {
    let stopped = false;

    call(container(PostMenu({ items })), 'onClick', { stopPropagation: () => (stopped = true) });

    expect(stopped).toBe(true);
  });

  it('action を選ぶと onSelect を呼ぶ', () => {
    const onSelect = vi.fn();
    const element = PostMenu({
      items: [{ key: 'mute', label: 'ミュート', kind: 'action', onSelect }],
      defaultOpen: true,
    });

    call(menuItem(element, 0), 'onClick');

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('copy を選ぶと、クリップボードへ text を書き込む', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const element = PostMenu({
      items: [{ key: 'copy', label: 'コピー', kind: 'copy', text: 'https://a.example/1' }],
      defaultOpen: true,
    });

    call(menuItem(element, 0), 'onClick');
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://a.example/1');
  });

  it('クリップボードに書き込めなくても例外を外へ出さない', async () => {
    vi.stubGlobal('navigator', {});
    const element = PostMenu({
      items: [{ key: 'copy', label: 'コピー', kind: 'copy', text: 'https://a.example/1' }],
      defaultOpen: true,
    });

    expect(() => call(menuItem(element, 0), 'onClick')).not.toThrow();
    await Promise.resolve();
  });

  describe('キーボード', () => {
    it('開いているときの Escape は、既定の動作を止めて window のキーボード操作へ伝えない', () => {
      const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };

      call(container(PostMenu({ items, defaultOpen: true })), 'onKeyDown', event);

      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it('閉じているときの Escape は、カードの選択解除のために伝える', () => {
      const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };

      call(container(PostMenu({ items })), 'onKeyDown', event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    });

    it.each(['Enter', 'j'])('閉じているときの %j は、カードのキー操作のために伝える', (key) => {
      const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() };

      call(container(PostMenu({ items })), 'onKeyDown', event);

      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it.each(['Enter', 'j'])('開いているときの %j は詳細への遷移などへ伝えない', (key) => {
      const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() };

      call(container(PostMenu({ items, defaultOpen: true })), 'onKeyDown', event);

      expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('フォーカスの戻し先', () => {
    it('開いているときに Escape で閉じると、トリガーへフォーカスを戻す', () => {
      const element = PostMenu({ items, defaultOpen: true });
      const focus = focusTarget(element);

      call(container(element), 'onKeyDown', { key: 'Escape', preventDefault: () => {}, stopPropagation: () => {} });

      expect(focus).toHaveBeenCalledOnce();
    });

    it('閉じているときの Escape では、フォーカスを動かさない', () => {
      const element = PostMenu({ items });
      const focus = focusTarget(element);

      call(container(element), 'onKeyDown', { key: 'Escape', preventDefault: () => {}, stopPropagation: () => {} });

      expect(focus).not.toHaveBeenCalled();
    });

    it('action を選ぶと、トリガーへフォーカスを戻す', () => {
      const element = PostMenu({ items, defaultOpen: true });
      const focus = focusTarget(element);

      call(menuItem(element, 2), 'onClick');

      expect(focus).toHaveBeenCalledOnce();
    });

    it('copy に成功すると、トリガーへフォーカスを戻す', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
      const element = PostMenu({ items, defaultOpen: true });
      const focus = focusTarget(element);

      call(menuItem(element, 1), 'onClick');

      await vi.waitFor(() => expect(focus).toHaveBeenCalledOnce());
    });

    it('copy に失敗したときは、メニューを開いたままフォーカスを動かさない', async () => {
      vi.stubGlobal('navigator', {});
      const element = PostMenu({ items, defaultOpen: true });
      const focus = focusTarget(element);

      call(menuItem(element, 1), 'onClick');
      await Promise.resolve();
      await Promise.resolve();

      expect(focus).not.toHaveBeenCalled();
    });
  });
});
