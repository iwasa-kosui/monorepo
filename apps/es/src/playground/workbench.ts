import { Compartment, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { baseName } from '../lib/file-tree.ts';
import { type FileSelectedDetail, fileSelectedEvent } from '../workspace/ide-events.ts';
import { element, query } from './dom.ts';
import { createEditorState, createEditorView, cursorOf } from './editor.ts';
import { createTourExtension, revealTourStep, type Tour, type TourControls, tourStepEffect } from './tour.ts';

export type WorkbenchOptions = {
  readonly root: HTMLElement;
  readonly files: Readonly<Record<string, string>>;
  readonly baseline: Readonly<Record<string, string>>;
  readonly editable: readonly string[];
  readonly opened: readonly string[];
  readonly deferShowAll?: boolean;
  readonly active: string;
  readonly wrap?: boolean;
  readonly typecheck?: boolean;
  readonly foldExcept?: { readonly file: string; readonly name: string };
  readonly onChange?: (file: string) => void;
  readonly onSelect?: (file: string) => void;
  readonly tour?: Tour;
  readonly onTourStep?: (index: number | null) => void;
};

export type Workbench = {
  readonly view: EditorView;
  readonly inIde: boolean;
  readonly active: () => string;
  readonly isOpen: (file: string) => boolean;
  readonly open: (file: string) => void;
  readonly doc: (file: string) => string;
  readonly docs: () => Record<string, string>;
  readonly setDoc: (file: string, doc: string) => void;
  readonly replaceDoc: (file: string, doc: string) => void;
  readonly showTourStep: (index: number) => void;
  readonly closeTour: () => void;
  readonly tourStep: () => number | null;
};

const readOnlyNote = '（読み取りだけ）';

export const createWorkbench = (options: WorkbenchOptions): Workbench => {
  const { root, baseline } = options;
  const tabList = query<HTMLElement>(root, '[role="tablist"]');
  const editorParent = query<HTMLElement>(root, '[data-role="editor"]');
  const shell = root.closest<HTMLElement>('[data-ide]');
  const names = Object.keys(options.files);
  const isEditable = (file: string): boolean => options.editable.includes(file);

  const position = shell?.querySelector<HTMLElement>('[data-ide-position]') ?? null;
  const statusFile = shell?.querySelector<HTMLElement>('[data-ide-status-file]') ?? null;

  const showCursor = (line: number, column: number): void => {
    if (position !== null) position.textContent = `行 ${line}、列 ${column}`;
  };

  let active = options.active;

  const markModified = (file: string, doc: string): void => {
    const mark = shell?.querySelector<HTMLElement>(`[data-ide-file="${CSS.escape(file)}"] [data-ide-mark]`);
    if (mark !== null && mark !== undefined) mark.hidden = !isEditable(file) || doc === baseline[file];
  };

  const typecheckSlot = new Compartment();
  let typecheckExtensions: ReadonlyMap<string, Extension> = new Map();

  let tourStep: number | null = null;
  const tourControls: TourControls = {
    previous: () => navigateTour(Math.max((tourStep ?? 0) - 1, 0), 'previous'),
    next: () => navigateTour(Math.min((tourStep ?? 0) + 1, (options.tour?.steps.length ?? 1) - 1), 'next'),
    restart: () => navigateTour(0, 'restart'),
    close: () => {
      closeTour();
      view.focus();
    },
  };

  const stateFor = (file: string, doc: string): EditorState =>
    createEditorState(doc, {
      language: 'typescript',
      label: `${file} のコード`,
      readOnly: !isEditable(file),
      ...(options.wrap === true ? { wrap: true } : {}),
      ...(options.foldExcept?.file === file ? { foldExportsExcept: options.foldExcept.name } : {}),
      ...(options.typecheck === true && isEditable(file)
        ? { typecheck: typecheckSlot.of(typecheckExtensions.get(file) ?? []) }
        : {}),
      ...(options.tour !== undefined ? { extensions: [createTourExtension(options.tour, file, tourControls)] } : {}),
      onChange: (next) => {
        markModified(file, next);
        options.onChange?.(file);
      },
      onCursor: showCursor,
    });

  const states = new Map<string, EditorState>(names.map((file) => [file, stateFor(file, options.files[file] ?? '')]));
  const view = createEditorView(editorParent, states.get(active) ?? stateFor(active, ''));

  const keep = (): void => {
    states.set(active, view.state);
  };

  const applyTour = (): void => {
    if (options.tour !== undefined) view.dispatch({ effects: tourStepEffect.of(tourStep) });
  };

  const revealActiveTourStep = (): void => {
    const step = tourStep === null ? undefined : options.tour?.steps[tourStep];
    if (step !== undefined && step.file === active) revealTourStep(view, step);
  };

  if (options.typecheck === true) {
    void import('./typecheck/extension.ts').then(({ createTypecheckExtensions }) => {
      typecheckExtensions = createTypecheckExtensions(options.files, options.editable);
      keep();
      for (const [file, state] of states) {
        const extension = typecheckExtensions.get(file);
        if (extension === undefined) continue;
        const effects = typecheckSlot.reconfigure(extension);
        if (file === active) view.dispatch({ effects });
        else states.set(file, state.update({ effects }).state);
      }
      keep();
    }).catch(() => undefined);
  }

  const tabsOf = (): HTMLButtonElement[] => [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tabOf = (file: string): HTMLButtonElement | undefined => tabsOf().find((tab) => tab.dataset.file === file);

  const buildTab = (file: string): HTMLElement => {
    const nested = baseName(file) !== file;
    const tab = element('button', {
      attributes: {
        type: 'button',
        role: 'tab',
        'data-file': file,
        ...(nested ? { 'aria-label': `${file}${isEditable(file) ? '' : readOnlyNote}` } : {}),
      },
    }, [
      element('span', { className: 'wb-icon', text: 'TS', attributes: { 'aria-hidden': 'true' } }),
      element('span', { className: 'wb-name', text: baseName(file) }),
      ...(isEditable(file) ? [] : [element('span', { className: 'wb-lock', text: readOnlyNote })]),
    ]);
    const close = element('button', {
      className: 'wb-close',
      attributes: { type: 'button', tabindex: '-1', 'aria-label': `${file} を閉じる`, 'data-close': file },
    });
    return element('span', { className: 'wb-tab', attributes: { role: 'presentation', 'data-tab': file } }, [
      tab,
      close,
    ]);
  };

  const markTabs = (): void => {
    const tabs = tabsOf();
    for (const tab of tabs) {
      const selected = tab.dataset.file === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.closest<HTMLElement>('.wb-tab')?.toggleAttribute('data-active', selected);
    }
    tabList.toggleAttribute('data-single', tabs.length <= 1);
  };

  const expandParents = (item: HTMLElement): void => {
    const folders: HTMLElement[] = [];
    for (
      let list = item.closest('.ide-files');
      list !== null;
      list = list.parentElement?.closest('.ide-files') ?? null
    ) {
      const folder = list.previousElementSibling;
      if (folder instanceof HTMLElement) folders.push(folder);
    }
    if (!folders.some((folder) => folder.hasAttribute('data-ide-dir'))) return;
    for (const folder of folders) folder.setAttribute('aria-expanded', 'true');
  };

  const keepInView = (item: HTMLElement): void => {
    const list = item.closest<HTMLElement>('.ide-side > .ide-files');
    if (list === null || list.clientHeight === 0 || list.scrollHeight <= list.clientHeight) return;
    const box = item.getBoundingClientRect();
    const frame = list.getBoundingClientRect();
    if (box.top < frame.top) list.scrollTop -= frame.top - box.top;
    else if (box.bottom > frame.bottom) list.scrollTop += box.bottom - frame.bottom;
  };

  const syncTabs = (): void => {
    markTabs();
    if (shell === null) return;
    for (const item of shell.querySelectorAll<HTMLElement>('[data-ide-file]')) {
      if (item.dataset.ideFile === active) {
        item.setAttribute('aria-current', 'true');
        expandParents(item);
        keepInView(item);
      } else item.removeAttribute('aria-current');
    }
    if (statusFile !== null) statusFile.textContent = active;
    const { line, column } = cursorOf(view.state);
    showCursor(line, column);
    shell.dispatchEvent(
      new CustomEvent<FileSelectedDetail>(fileSelectedEvent, { bubbles: true, detail: { file: active } }),
    );
  };

  // ファイルごとのスクロール位置。タブを切り替えて戻ったときに、同じ場所を出す
  const scrolls = new Map<string, number>();

  const select = (file: string): void => {
    const state = states.get(file);
    if (state === undefined) return;
    if (file !== active) {
      scrolls.set(active, view.scrollDOM.scrollTop);
      keep();
      active = file;
      view.setState(state);
      applyTour();
      const top = scrolls.get(file) ?? 0;
      view.requestMeasure({
        read: () => null,
        write: () => {
          view.scrollDOM.scrollTop = top;
        },
      });
    }
    syncTabs();
    const tab = tabOf(file)?.closest<HTMLElement>('.wb-tab') ?? tabOf(file);
    const strip = tabList.getBoundingClientRect();
    const box = tab?.getBoundingClientRect();
    if (box !== undefined && box.width > 0) {
      if (box.left < strip.left) tabList.scrollLeft -= strip.left - box.left;
      else if (box.right > strip.right) tabList.scrollLeft += box.right - strip.right;
    }
    options.onSelect?.(file);
  };

  const open = (file: string): void => {
    if (!states.has(file)) return;
    if (tabOf(file) === undefined) {
      if (shell === null) return;
      tabList.append(buildTab(file));
    }
    select(file);
  };

  const close = (file: string): void => {
    const tabs = tabsOf();
    const index = tabs.findIndex((tab) => tab.dataset.file === file);
    if (shell === null || shell.dataset.sidebar === 'closed' || index === -1 || tabs.length <= 1) return;
    const wasActive = file === active;
    const hadFocus = tabList.contains(document.activeElement);
    tabs[index]?.closest('.wb-tab')?.remove();
    const neighbor = tabs[index + 1] ?? tabs[index - 1];
    if (wasActive && neighbor?.dataset.file !== undefined) select(neighbor.dataset.file);
    else syncTabs();
    if (hadFocus) tabOf(active)?.focus();
  };

  if (shell !== null) {
    tabList.replaceChildren(...options.opened.filter((file) => states.has(file)).map(buildTab));
    tabList.setAttribute('aria-label', '開いているファイル');
    root.setAttribute('data-ide-mode', '');
    shell.addEventListener('click', (event) => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ide-file]') : null;
      if (item !== null) open(item.dataset.ideFile ?? '');
    });
  }

  if (shell !== null) {
    const showAllTabs = (): void => {
      if (shell.dataset.sidebar !== 'closed') return;
      if (options.deferShowAll === true && shell.dataset.sidebarDecided === undefined) return;
      for (const file of names) {
        if (tabOf(file) === undefined) tabList.append(buildTab(file));
      }
      markTabs();
    };
    new MutationObserver(showAllTabs).observe(shell, {
      attributes: true,
      attributeFilter: ['data-sidebar', 'data-sidebar-decided'],
    });
    showAllTabs();
  }

  const focusTourCard = (preferred: string, attempts = 8): void => {
    requestAnimationFrame(() => {
      const card = view.dom.querySelector('.cm-tour-card');
      const buttons = [preferred, 'next', 'restart', 'previous'].flatMap((action) =>
        card?.querySelector<HTMLButtonElement>(`[data-tour-action="${action}"]`) ?? []
      );
      const button = buttons.find((candidate) => !candidate.disabled);
      if (button !== undefined) button.focus({ preventScroll: true });
      else if (attempts > 0) focusTourCard(preferred, attempts - 1);
    });
  };

  function navigateTour(index: number, action: string): void {
    showTourStep(index);
    focusTourCard(action);
  }

  function showTourStep(index: number): void {
    const step = options.tour?.steps[index];
    if (step === undefined || !states.has(step.file)) return;
    tourStep = index;
    open(step.file);
    applyTour();
    revealTourStep(view, step);
    options.onTourStep?.(index);
  }

  function closeTour(): void {
    tourStep = null;
    applyTour();
    options.onTourStep?.(null);
  }

  tabList.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const closing = target?.closest<HTMLElement>('[data-close]');
    if (closing !== null && closing !== undefined) {
      close(closing.dataset.close ?? '');
      return;
    }
    const tab = target?.closest<HTMLButtonElement>('[role="tab"]');
    if (tab !== null && tab !== undefined) select(tab.dataset.file ?? '');
  });
  tabList.addEventListener('auxclick', (event) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('.wb-tab') : null;
    if (event.button === 1 && tab !== null) {
      event.preventDefault();
      close(tab.dataset.tab ?? '');
    }
  });
  tabList.addEventListener('keydown', (event) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[role="tab"]') : null;
    if (tab === null) return;
    if (event.key === 'Delete') {
      event.preventDefault();
      close(tab.dataset.file ?? '');
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const tabs = tabsOf();
    const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next !== undefined) {
      select(next.dataset.file ?? '');
      next.focus();
    }
  });

  for (const file of names) markModified(file, options.files[file] ?? '');
  syncTabs();

  return {
    view,
    inIde: shell !== null,
    active: () => active,
    isOpen: (file) => tabOf(file) !== undefined,
    open,
    doc: (file) => (file === active ? view.state : states.get(file))?.doc.toString() ?? '',
    docs: () => {
      keep();
      return Object.fromEntries(names.map((file) => [file, states.get(file)?.doc.toString() ?? '']));
    },
    setDoc: (file, doc) => {
      if (!states.has(file)) return;
      keep();
      states.set(file, stateFor(file, doc));
      if (file === active) {
        view.setState(states.get(file) ?? stateFor(file, doc));
        applyTour();
        revealActiveTourStep();
      }
      markModified(file, doc);
    },
    replaceDoc: (file, doc) => {
      const state = file === active ? view.state : states.get(file);
      if (state === undefined) return;
      const change = { changes: { from: 0, to: state.doc.length, insert: doc }, selection: { anchor: 0 } };
      if (file === active) {
        view.dispatch(change);
        return;
      }
      states.set(file, state.update(change).state);
      markModified(file, doc);
      options.onChange?.(file);
    },
    showTourStep,
    closeTour,
    tourStep: () => tourStep,
  };
};
