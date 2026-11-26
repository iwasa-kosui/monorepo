import { must } from './dom';

export type TabsView = {
  readonly selected: string;
  readonly unseen: ReadonlySet<string>;
  readonly chatFront: boolean;
  readonly compact: boolean;
};

export type Tabs = {
  readonly has: (key: string) => boolean;
  readonly add: (key: string) => HTMLElement | null;
  readonly panelOf: (key: string) => HTMLElement | undefined;
  readonly removeAdded: () => void;
  readonly sync: (view: TabsView) => void;
};

export type TabsHooks = {
  readonly choose: (key: string) => void;
  readonly chooseChat: () => void;
};

export const createTabs = (root: HTMLElement, hooks: TabsHooks): Tabs => {
  const tabList = must<HTMLElement>(root, '[role="tablist"]');
  const pages = must<HTMLElement>(root, '.pages');
  const address = must<HTMLElement>(root, '[data-address]');
  const added = new Set<string>();
  const stripEdge = 8;
  const chatWindow = root.querySelector<HTMLElement>('.win.chat');
  let shown = '';
  let shownTab: HTMLButtonElement | null = null;

  const slideIn = (target: HTMLElement | null | undefined, direction: 1 | -1): void => {
    if (target === null || target === undefined) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    target.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 28}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  };

  const tabsOf = (): HTMLButtonElement[] => [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"][data-tool]')];
  const chatTab = tabList.querySelector<HTMLButtonElement>('[data-chat-tab]');
  const shownTabsOf = (): HTMLButtonElement[] =>
    [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter((tab) => tab.getClientRects().length > 0);
  const pick = (tab: HTMLButtonElement): void => {
    if (tab === chatTab) hooks.chooseChat();
    else hooks.choose(tab.dataset.tool ?? '');
  };
  const panelsOf = (): HTMLElement[] => [...pages.querySelectorAll<HTMLElement>('[role="tabpanel"][data-tool]')];
  const templateOf = (kind: 'button' | 'panel', key: string): HTMLTemplateElement | null =>
    root.querySelector<HTMLTemplateElement>(`template[data-tab-${kind}="${key}"]`);

  const tabOf = (event: Event): HTMLButtonElement | null =>
    event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[role="tab"]') : null;

  tabList.addEventListener('click', (event) => {
    const tab = tabOf(event);
    if (tab !== null) pick(tab);
  });
  tabList.addEventListener('keydown', (event) => {
    const tab = tabOf(event);
    if (tab === null || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const tabs = shownTabsOf();
    const index = tabs.indexOf(tab);
    const target = event.key === 'ArrowRight'
      ? tabs[(index + 1) % tabs.length]
      : event.key === 'ArrowLeft'
      ? tabs[(index + tabs.length - 1) % tabs.length]
      : event.key === 'Home'
      ? tabs[0]
      : event.key === 'End'
      ? tabs[tabs.length - 1]
      : undefined;
    if (target === undefined) return;
    event.preventDefault();
    pick(target);
    target.focus();
  });

  const removeAdded = (): void => {
    for (const key of added) {
      for (const element of root.querySelectorAll(`[data-tool="${key}"]`)) {
        element.remove();
      }
    }
    added.clear();
  };

  return {
    has: (key) => tabsOf().some((tab) => tab.dataset.tool === key),
    add: (key) => {
      if (tabsOf().some((tab) => tab.dataset.tool === key)) return null;
      const button = templateOf('button', key);
      const panel = templateOf('panel', key);
      if (button === null || panel === null) {
        throw new Error(`追加するタブの部品が見つかりません: ${key}`);
      }
      tabList.append(button.content.cloneNode(true));
      pages.append(panel.content.cloneNode(true));
      added.add(key);
      return pages.querySelector<HTMLElement>(`[role="tabpanel"][data-tool="${key}"]`);
    },
    panelOf: (key) => panelsOf().find((panel) => panel.dataset.tool === key),
    removeAdded,
    sync: (view) => {
      const selected = view.selected;
      const tabs = tabsOf();
      for (const tab of tabs) {
        const key = tab.dataset.tool ?? '';
        const isSelected = key === selected && !view.chatFront;
        tab.setAttribute('aria-selected', String(isSelected));
        tab.tabIndex = isSelected ? 0 : -1;
        const unseen = tab.querySelector<HTMLElement>('[data-unseen]');
        if (unseen !== null) {
          unseen.hidden = !view.unseen.has(key);
        }
      }
      if (chatTab !== null) {
        chatTab.setAttribute('aria-selected', String(view.chatFront));
        chatTab.tabIndex = view.chatFront ? 0 : -1;
      }
      for (const panel of panelsOf()) {
        panel.hidden = panel.dataset.tool !== selected;
      }
      const front = view.chatFront ? chatTab : tabs.find((tab) => tab.dataset.tool === selected);
      const frontKey = view.chatFront ? 'chat' : `tool:${selected}`;
      if (front !== null && front !== undefined && frontKey !== shown) {
        const order = shownTabsOf();
        const previous = shownTab;
        const first = shown === '';
        shown = frontKey;
        shownTab = front;
        if (view.compact && !first && previous !== null) {
          const panel = view.chatFront ? chatWindow : panelsOf().find((item) => item.dataset.tool === selected);
          slideIn(panel, order.indexOf(front) >= order.indexOf(previous) ? 1 : -1);
        }
        const strip = tabList.getBoundingClientRect();
        const box = front.getBoundingClientRect();
        if (box.width > 0 && box.left < strip.left) tabList.scrollLeft -= strip.left - box.left + stripEdge;
        else if (box.width > 0 && box.right > strip.right) tabList.scrollLeft += box.right - strip.right + stripEdge;
      }
      address.textContent = tabs.find((tab) => tab.dataset.tool === selected)?.dataset.url ?? '';
    },
  };
};
