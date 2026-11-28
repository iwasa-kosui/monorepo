export type OptionTabs = {
  readonly select: (key: string) => void;
  readonly selected: () => string | null;
  readonly tabOf: (key: string) => HTMLElement | undefined;
};

let counter = 0;

export const nextKey = (keys: readonly string[], current: string | null, event: string): string | null => {
  if (keys.length === 0) return null;
  const index = current === null ? -1 : keys.indexOf(current);
  if (event === 'Home') return keys[0] ?? null;
  if (event === 'End') return keys[keys.length - 1] ?? null;
  if (event === 'ArrowRight') return keys[(index + 1) % keys.length] ?? null;
  if (event === 'ArrowLeft') return keys[(index + keys.length - 1) % keys.length] ?? null;
  return null;
};

export const mountOptionTabs = (root: HTMLElement): OptionTabs => {
  const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"][data-option-tab]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"][data-option-panel]')];
  const keys = tabs.map((tab) => tab.dataset.optionTab ?? '');
  const prefix = `option-tabs-${++counter}`;
  tabs.forEach((tab, index) => {
    const panel = panels.find((item) => item.dataset.optionPanel === tab.dataset.optionTab);
    tab.id = `${prefix}-tab-${index}`;
    if (panel === undefined) return;
    panel.id = `${prefix}-panel-${index}`;
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('aria-labelledby', tab.id);
  });

  const selected = (): string | null =>
    tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.optionTab ?? null;
  const select = (key: string): void => {
    if (!keys.includes(key)) return;
    for (const tab of tabs) {
      const on = tab.dataset.optionTab === key;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.optionPanel !== key;
  };

  root.addEventListener('click', (event) => {
    const tab = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[role="tab"][data-option-tab]')
      : null;
    if (tab !== null && root.contains(tab)) select(tab.dataset.optionTab ?? '');
  });
  root.addEventListener('keydown', (event) => {
    const tab = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[role="tab"][data-option-tab]')
      : null;
    if (tab === null || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const key = nextKey(keys, tab.dataset.optionTab ?? null, event.key);
    if (key === null) return;
    event.preventDefault();
    select(key);
    tabs.find((item) => item.dataset.optionTab === key)?.focus();
  });

  return { select, selected, tabOf: (key) => tabs.find((tab) => tab.dataset.optionTab === key) };
};
