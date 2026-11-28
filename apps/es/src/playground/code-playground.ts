import { createRuntime, RuntimeScriptError } from './client.ts';
import { applyRuntimeState, element, failureElement, mountWhenShown, query } from './dom.ts';
import { revealText } from './editor.ts';
import { maxLogLineChars, maxMessageChars } from './engine/limits.ts';
import type { LogLine, LogTable, RunOutcome } from './engine/types.ts';
import { clearEdits, loadEdits, saveEdits } from './storage.ts';
import { type Tour, tourAnnouncement } from './tour.ts';
import { createWorkbench } from './workbench.ts';

const maxShownFailures = 50;

type CodeConfig = {
  exerciseId: string;
  files: Record<string, string>;
  editable: string[];
  readonly: string[];
  opened?: string[];
  testFile: string | null;
  reveal: string | null;
  complete: { files: Record<string, string> } | null;
  tour?: Tour | null;
};

const renderTable = ({ head, rows }: LogTable): HTMLElement =>
  element('div', { className: 'playground-table-scroll' }, [
    element('table', { className: 'playground-console-table' }, [
      element('thead', {}, [element('tr', {}, head.map((title) => element('th', { text: title })))]),
      element('tbody', {}, rows.map((row) => element('tr', {}, row.map((cell) => element('td', { text: cell }))))),
    ]),
  ]);

const renderLogLines = (logs: readonly LogLine[]): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  let texts: string[] = [];
  const flush = (): void => {
    if (texts.length > 0) {
      elements.push(element('pre', { className: 'playground-log', text: texts.join('\n') }));
      texts = [];
    }
  };
  for (const line of logs) {
    if (line.table === undefined) {
      texts.push(line.text);
    } else {
      flush();
      elements.push(renderTable(line.table));
    }
  }
  flush();
  return elements;
};

const renderLogs = (outcome: RunOutcome): HTMLElement[] => {
  const { totalLines, shownLines, cutLines } = outcome.logSummary;
  if (totalLines === 0) {
    return [];
  }
  const notes: HTMLElement[] = [];
  if (totalLines > shownLines) {
    notes.push(element('p', {
      className: 'playground-note',
      text: `出力が多いため、先頭の ${shownLines} 行までを表示しています。実際の出力は ${totalLines} 行です`,
    }));
  }
  if (cutLines > 0) {
    notes.push(element('p', {
      className: 'playground-note',
      text: `${cutLines} 行は長すぎるため、先頭の ${maxLogLineChars} 文字までを表示しています`,
    }));
  }
  return [
    element('p', { className: 'playground-label', text: '出力' }),
    ...renderLogLines(outcome.logs),
    ...notes,
  ];
};

const renderTests = (tests: NonNullable<RunOutcome['tests']>, cutMessages: number): HTMLElement[] => {
  const passed = tests.filter((test) => test.status === 'pass').length;
  const failed = tests.filter((test) => test.status === 'fail');
  const skipped = tests.filter((test) => test.status === 'skipped').length;
  const elements: HTMLElement[] = [
    element('p', {
      className: failed.length === 0 ? 'playground-summary result--ok' : 'playground-summary result--ng',
      text: `pass ${passed} / fail ${failed.length}`,
      attributes: { 'data-role': 'summary' },
    }),
  ];
  if (skipped > 0) {
    elements.push(element('p', { className: 'playground-note', text: `実行しなかったテストが ${skipped} 件あります` }));
  }
  if (failed.length > 0) {
    elements.push(element('p', { className: 'playground-label', text: '失敗したテスト' }));
    elements.push(element(
      'ul',
      { className: 'playground-failures' },
      failed.slice(0, maxShownFailures).map((test) =>
        element('li', {}, [
          element('strong', { text: [...test.path, test.name].join(' > ') }),
          element('pre', { text: test.message ?? '' }),
        ])
      ),
    ));
    if (failed.length > maxShownFailures) {
      elements.push(element('p', {
        className: 'playground-note',
        text: `失敗したテストが多いため、先頭の ${maxShownFailures} 件までを表示しています`,
      }));
    }
  }
  if (cutMessages > 0) {
    elements.push(element('p', {
      className: 'playground-note',
      text: `長いメッセージは、先頭の ${maxMessageChars} 文字までを表示しています`,
    }));
  }
  return elements;
};

const renderOutcome = (outcome: RunOutcome, kind: 'tests' | 'script'): HTMLElement[] => {
  if (outcome.error !== null) {
    return [
      element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
        element('p', { text: 'コードを最後まで実行できませんでした' }),
        element('pre', { text: outcome.error }),
        ...(outcome.cutMessages > 0
          ? [
            element('p', {
              className: 'playground-note',
              text: `長いメッセージは、先頭の ${maxMessageChars} 文字までを表示しています`,
            }),
          ]
          : []),
      ]),
      ...renderLogs(outcome),
    ];
  }
  if (kind === 'tests') {
    return [
      ...(outcome.tests === null
        ? [element('p', { className: 'playground-note', text: 'このファイルにテストが見つかりませんでした' })]
        : renderTests(outcome.tests, outcome.cutMessages)),
      ...renderLogs(outcome),
    ];
  }
  return outcome.logSummary.totalLines === 0
    ? [element('p', { className: 'playground-note', text: '最後まで実行しました。出力はありません' })]
    : renderLogs(outcome);
};

const createTourPanel = (
  root: HTMLElement,
  tour: Tour,
  onSelect: (index: number) => void,
): { update: (index: number | null) => void } | null => {
  const side = root.closest('[data-ide]')?.querySelector<HTMLElement>('.ide-side') ?? null;
  if (side === null) {
    return null;
  }
  const listId = `${side.querySelector('.ide-files')?.id ?? 'ide-files'}-tour`;
  const head = element('button', {
    className: 'ide-folder ide-tour-head',
    attributes: { type: 'button', 'aria-expanded': 'true', 'aria-controls': listId },
  }, [
    element('span', { className: 'ide-chevron', attributes: { 'aria-hidden': 'true' } }),
    element('span', { className: 'ide-folder-name', text: 'CODE TOUR' }),
  ]);
  const buttons = tour.steps.map((step, index) =>
    element('button', {
      className: 'ide-tour-step',
      attributes: { type: 'button', 'data-ide-tour-step': String(index), title: step.title },
    }, [
      element('span', { className: 'ide-tour-index', text: String(index + 1), attributes: { 'aria-hidden': 'true' } }),
      element('span', { className: 'ide-tour-name', text: step.title }),
    ])
  );
  const list = element(
    'ol',
    { className: 'ide-tour-steps', attributes: { id: listId, 'aria-label': tour.title } },
    buttons.map((button) => element('li', {}, [button])),
  );
  const section = element('section', { className: 'ide-tour', attributes: { 'aria-label': 'CODE TOUR' } }, [
    head,
    list,
  ]);
  const status = element('div', {
    className: 'visually-hidden',
    attributes: { 'aria-live': 'polite', 'data-role': 'tour-status' },
  });
  side.dataset['tour'] = '';
  side.append(section);
  root.append(status);

  head.addEventListener('click', () => {
    head.setAttribute('aria-expanded', String(head.getAttribute('aria-expanded') !== 'true'));
  });
  list.addEventListener('click', (event) => {
    const picked = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-ide-tour-step]')
      : null;
    if (picked !== null) {
      onSelect(Number(picked.dataset['ideTourStep']));
    }
  });

  const keepVisible = (button: HTMLElement): void => {
    if (list.clientHeight === 0) {
      return;
    }
    const top = button.offsetTop;
    const bottom = top + button.offsetHeight;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  };

  return {
    update: (index) => {
      buttons.forEach((button, position) => {
        if (position === index) {
          button.setAttribute('aria-current', 'step');
          keepVisible(button);
        } else {
          button.removeAttribute('aria-current');
        }
      });
      if (index !== null) {
        status.textContent = tourAnnouncement(tour, index);
      }
    },
  };
};

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as CodeConfig;
  const output = query<HTMLElement>(root, '[data-role="output"]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-role="reset"]');
  const retryButton = query<HTMLButtonElement>(root, '[data-role="retry"]');
  const restoreButton = root.querySelector<HTMLButtonElement>('[data-role="restore"]');
  const completeButton = root.querySelector<HTMLButtonElement>('[data-role="complete"]');
  const runButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-run-file]')];
  const shown = [...config.editable, ...config.readonly];
  const inIde = root.closest('[data-ide]') !== null;
  const openable = inIde ? Object.keys(config.files) : shown;
  const opened = inIde ? config.opened ?? shown : shown;
  root.setAttribute('data-mounted', '');
  let busy = false;
  let backup: Record<string, string> | null = null;

  const discardBackup = (): void => {
    backup = null;
    if (restoreButton !== null) {
      restoreButton.hidden = true;
    }
  };

  const tour = inIde ? config.tour ?? null : null;
  const tourPanel = tour === null ? null : createTourPanel(root, tour, (index) => workbench.showTourStep(index));
  const saved = loadEdits(config.exerciseId);
  const workbench = createWorkbench({
    root,
    files: Object.fromEntries(
      openable.map((file) => [
        file,
        config.editable.includes(file) ? saved[file] ?? config.files[file] ?? '' : config.files[file] ?? '',
      ]),
    ),
    baseline: config.files,
    editable: config.editable,
    opened,
    ...(inIde && config.opened !== undefined ? { deferShowAll: true } : {}),
    active: opened[0] ?? '',
    onChange: () => {
      persist();
      discardBackup();
    },
    onSelect: () => reveal(),
    ...(tour !== null && tourPanel !== null ? { tour, onTourStep: tourPanel.update } : {}),
  });
  const view = workbench.view;

  const currentDocs = (): Record<string, string> => workbench.docs();

  function persist(): void {
    const docs = currentDocs();
    const edits = Object.fromEntries(config.editable.map((file) => [file, docs[file] ?? '']));
    const untouched = config.editable.every((file) => edits[file] === config.files[file]);
    if (untouched) {
      clearEdits(config.exerciseId);
    } else {
      saveEdits(config.exerciseId, edits);
    }
  }

  function reveal(): void {
    if (config.reveal !== null && config.editable.includes(workbench.active())) {
      revealText(view, config.reveal);
    }
  }

  const replaceDocs = (docs: Readonly<Record<string, string>>): void => {
    for (const file of config.editable) {
      workbench.setDoc(file, docs[file] ?? config.files[file] ?? '');
    }
    reveal();
  };

  const updateControls = (): void => {
    const disabled = busy || root.dataset.state !== 'ready';
    for (const button of runButtons) {
      button.disabled = disabled;
    }
  };

  const runtime = createRuntime((state) => {
    applyRuntimeState(root, state);
    updateControls();
  }, (message) => {
    output.replaceChildren(failureElement(new RuntimeScriptError(message), ''));
  });

  const execute = async (entry: string, kind: 'tests' | 'script'): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    output.replaceChildren(element('p', { className: 'playground-note', text: '実行しています' }));
    try {
      const outcome = await runtime.runCode({ ...config.files, ...currentDocs() }, entry);
      output.replaceChildren(...renderOutcome(outcome, kind));
    } catch (error) {
      output.replaceChildren(failureElement(error, '終わらない繰り返しがないか確かめてください'));
    } finally {
      busy = false;
      updateControls();
    }
  };

  for (const button of runButtons) {
    const file = button.dataset.runFile ?? '';
    button.addEventListener('click', () => void execute(file, file === config.testFile ? 'tests' : 'script'));
  }
  const editableDocs = (): Record<string, string> => {
    const docs = currentDocs();
    return Object.fromEntries(config.editable.map((file) => [file, docs[file] ?? '']));
  };

  const sameDocs = (left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean =>
    config.editable.every((file) => left[file] === (right[file] ?? config.files[file]));

  const replaceWithBackup = (target: Readonly<Record<string, string>>): void => {
    const before = editableDocs();
    backup = sameDocs(before, config.files) || sameDocs(before, target) ? null : before;
    if (restoreButton !== null) {
      restoreButton.hidden = backup === null;
    }
    replaceDocs(target);
    persist();
  };

  resetButton?.addEventListener('click', () => replaceWithBackup(config.files));
  completeButton?.addEventListener('click', () => {
    if (config.complete !== null) {
      replaceWithBackup(config.complete.files);
    }
  });
  restoreButton?.addEventListener('click', () => {
    if (backup !== null) {
      replaceDocs(backup);
      persist();
    }
    backup = null;
    if (restoreButton !== null) {
      restoreButton.hidden = true;
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      discardBackup();
      replaceDocs(loadEdits(config.exerciseId));
    }
  });
  retryButton.addEventListener('click', () => runtime.reload());
  reveal();
  if (tourPanel !== null) {
    workbench.showTourStep(0);
  }
  updateControls();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-playground="code"]')) {
  mountWhenShown(root, mount);
}
