export const query = <T extends Element>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`要素が見つかりません: ${selector}`);
  }
  return found;
};

export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string; attributes?: Record<string, string> } = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] => {
  const created = document.createElement(tag);
  if (options.className !== undefined) {
    created.className = options.className;
  }
  if (options.text !== undefined) {
    created.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    created.setAttribute(name, value);
  }
  created.append(...children);
  return created;
};

export const applyRuntimeState = (root: HTMLElement, state: 'loading' | 'ready' | 'failed'): void => {
  root.dataset.state = state;
  const status = query<HTMLElement>(root, '[data-role="status"]');
  const text = query<HTMLElement>(status, '[data-role="status-text"]');
  const retry = query<HTMLButtonElement>(status, '[data-role="retry"]');
  status.hidden = state === 'ready';
  retry.hidden = state !== 'failed';
  text.textContent = state === 'failed' ? '実行環境を読み込めませんでした' : '実行環境を読み込んでいます';
};
