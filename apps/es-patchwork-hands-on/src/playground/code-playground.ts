import type { EditorState } from '@codemirror/state';

import { createRuntime, RuntimeScriptError } from './client.ts';
import { applyRuntimeState, element, failureElement, query } from './dom.ts';
import { createEditorState, createEditorView, revealText } from './editor.ts';
import { maxLogLineChars, maxMessageChars } from './engine/limits.ts';
import type { RunOutcome } from './engine/types.ts';
import { clearEdits, loadEdits, saveEdits } from './storage.ts';

const maxShownFailures = 50;

type CodeConfig = {
  exerciseId: string;
  files: Record<string, string>;
  editable: string[];
  readonly: string[];
  testFile: string | null;
  reveal: string | null;
  complete: { files: Record<string, string> } | null;
};

const logText = (outcome: RunOutcome): string => outcome.logs.map((line) => line.text).join('\n');

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
    element('pre', { className: 'playground-log', text: logText(outcome) }),
    ...notes,
  ];
};

const renderTests = (tests: NonNullable<RunOutcome['tests']>, cutMessages: number): HTMLElement[] => {
  const passed = tests.filter((test) => test.status === 'pass').length;
  const failed = tests.filter((test) => test.status === 'fail');
  const skipped = tests.filter((test) => test.status === 'skipped').length;
  const elements: HTMLElement[] = [
    element('p', {
      className: failed.length === 0 ? 'playground-summary' : 'playground-summary playground-summary-failed',
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

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as CodeConfig;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const output = query<HTMLElement>(root, '[data-role="output"]');
  const editorParent = query<HTMLElement>(root, '[data-role="editor"]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-role="reset"]');
  const retryButton = query<HTMLButtonElement>(root, '[data-role="retry"]');
  const restoreButton = root.querySelector<HTMLButtonElement>('[data-role="restore"]');
  const completeButton = root.querySelector<HTMLButtonElement>('[data-role="complete"]');
  const runButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-run-file]')];
  const shown = [...config.editable, ...config.readonly];
  root.setAttribute('data-mounted', '');
  let busy = false;
  let backup: Record<string, string> | null = null;

  const discardBackup = (): void => {
    backup = null;
    if (restoreButton !== null) {
      restoreButton.hidden = true;
    }
  };

  const stateFor = (file: string, doc: string): EditorState =>
    createEditorState(doc, {
      language: 'typescript',
      label: `${file} のコード`,
      readOnly: !config.editable.includes(file),
      onChange: () => {
        persist();
        discardBackup();
      },
    });

  const saved = loadEdits(config.exerciseId);
  const states = new Map<string, EditorState>(
    shown.map((
      file,
    ) => [
      file,
      stateFor(
        file,
        config.editable.includes(file) ? saved[file] ?? config.files[file] ?? '' : config.files[file] ?? '',
      ),
    ]),
  );
  let active = shown[0] ?? '';
  const view = createEditorView(editorParent, states.get(active) ?? stateFor(active, ''));

  const currentDocs = (): Record<string, string> => {
    states.set(active, view.state);
    return Object.fromEntries(shown.map((file) => [file, states.get(file)?.doc.toString() ?? '']));
  };

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

  const reveal = (): void => {
    if (config.reveal !== null && config.editable.includes(active)) {
      revealText(view, config.reveal);
    }
  };

  const select = (file: string): void => {
    states.set(active, view.state);
    active = file;
    view.setState(states.get(file) ?? stateFor(file, ''));
    reveal();
    for (const tab of tabs) {
      const selected = tab.dataset.file === file;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  };

  const replaceDocs = (docs: Readonly<Record<string, string>>): void => {
    states.set(active, view.state);
    for (const file of config.editable) {
      states.set(file, stateFor(file, docs[file] ?? config.files[file] ?? ''));
    }
    view.setState(states.get(active) ?? stateFor(active, ''));
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
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab.dataset.file ?? ''));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (next !== undefined) {
        select(next.dataset.file ?? '');
        next.focus();
      }
    });
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
  select(active);
  updateControls();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-playground="code"]')) {
  if (!root.hidden) {
    mount(root);
    continue;
  }
  const observer = new MutationObserver(() => {
    if (!root.hidden) {
      observer.disconnect();
      mount(root);
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['hidden'] });
}
