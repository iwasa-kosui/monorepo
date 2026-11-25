import { type FileSelectedDetail, fileSelectedEvent } from '../ide-events';
import type { PanelMount } from '../panel';
import { watchSlotSignals } from './watch';

const drawerMaxRem = 40;

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

  const isDrawer = (): boolean => {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return ide.getBoundingClientRect().width < drawerMaxRem * rem;
  };

  const sync = (): void => {
    const open = isDrawer() ? ide.dataset.drawer === 'open' : ide.dataset.sidebar === 'open';
    toggle?.setAttribute('aria-expanded', String(open));
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
    if (title !== null) title.textContent = `${file} — ${project}`;
    browserTab.dataset.url = `${baseUrl}${file}`;
    if (address !== null && browserTab.getAttribute('aria-selected') === 'true') {
      address.textContent = browserTab.dataset.url;
    }
  });
  new ResizeObserver(sync).observe(ide);
  sync();
  return {};
};
