import { type FileSelectedDetail, fileSelectedEvent } from '../ide-events';
import type { PanelMount } from '../panel';
import { watchSlotSignals } from './watch';

const drawerMaxRem = 40;
const sidebarOpenMinRem = 56;

export const mountEditor: PanelMount<'editor'> = (host) => {
  watchSlotSignals(host);
  const { panel, root, tab } = host;
  const ide = panel.querySelector<HTMLElement>('[data-ide]');
  if (ide === null) return {};
  const toggle = ide.querySelector<HTMLButtonElement>('[data-ide-toggle]');
  const folder = ide.querySelector<HTMLButtonElement>('[data-ide-folder]');
  const scrim = ide.querySelector<HTMLButtonElement>('[data-ide-scrim]');
  const browserTab = root.querySelector<HTMLElement>(`[role="tab"][data-tool="${tab.key}"]`);
  const address = root.querySelector<HTMLElement>('[data-address]');
  const project = tab.config.project;
  const baseUrl = tab.url.slice(0, tab.url.lastIndexOf('/') + 1);
  // タブの名前がファイル名でないとき（開始コードを並べるタブ）は、ファイルを選んでも名前を変えない
  const namedByFile = tab.title === `${tab.config.active} — ${project}`;

  const remPx = (): number => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  const isDrawer = (): boolean => ide.getBoundingClientRect().width < drawerMaxRem * remPx();

  let decided = false;
  const decideSidebar = (): void => {
    if (decided) return;
    const { width } = ide.getBoundingClientRect();
    if (width === 0) return;
    decided = true;
    if (ide.querySelector('[data-play="add-record"]') === null && width >= sidebarOpenMinRem * remPx()) {
      ide.dataset.sidebar = 'open';
    }
  };

  const sync = (): void => {
    const open = isDrawer() ? ide.dataset.drawer === 'open' : ide.dataset.sidebar === 'open';
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'EXPLORER を閉じる' : 'EXPLORER を開く');
  };

  const setDrawer = (open: boolean): void => {
    ide.dataset.drawer = open ? 'open' : 'closed';
    sync();
  };

  toggle?.addEventListener('click', () => {
    if (isDrawer()) setDrawer(ide.dataset.drawer !== 'open');
    else ide.dataset.sidebar = ide.dataset.sidebar === 'open' ? 'closed' : 'open';
    sync();
  });
  scrim?.addEventListener('click', () => setDrawer(false));
  ide.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || ide.dataset.drawer !== 'open' || !isDrawer()) return;
    event.stopPropagation();
    setDrawer(false);
    toggle?.focus();
  });
  folder?.addEventListener('click', () => {
    folder.setAttribute('aria-expanded', String(folder.getAttribute('aria-expanded') !== 'true'));
  });
  ide.addEventListener('click', (event) => {
    const picked = event.target instanceof Element && event.target.closest('[data-ide-file]') !== null;
    if (picked && ide.dataset.drawer === 'open') setDrawer(false);
  });
  ide.addEventListener(fileSelectedEvent, (event) => {
    const { file } = (event as CustomEvent<FileSelectedDetail>).detail;
    if (browserTab === null) return;
    const title = browserTab.querySelector<HTMLElement>('.tab-title');
    if (title !== null && namedByFile) title.textContent = `${file} — ${project}`;
    browserTab.dataset.url = `${baseUrl}${file}`;
    if (address !== null && browserTab.getAttribute('aria-selected') === 'true') {
      address.textContent = browserTab.dataset.url;
    }
  });
  new ResizeObserver(() => {
    decideSidebar();
    sync();
  }).observe(ide);
  decideSidebar();
  sync();
  return {};
};
