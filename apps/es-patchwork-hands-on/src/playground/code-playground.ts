import type { EditorState } from '@codemirror/state';

import { createRuntime, executionLimitMs, RuntimeTimeoutError } from './client.ts';
import { applyRuntimeState, element, query } from './dom.ts';
import { createEditorState, createEditorView } from './editor.ts';
import type { RunOutcome } from './engine/types.ts';
import { clearEdits, loadEdits, saveEdits } from './storage.ts';

type CodeConfig = {
  exerciseId: string;
  files: Record<string, string>;
  editable: string[];
  readonly: string[];
  testFile: string | null;
  complete: { files: Record<string, string> } | null;
};

const logText = (outcome: RunOutcome): string => outcome.logs.map((line) => line.text).join('\n');

const renderLogs = (outcome: RunOutcome): HTMLElement[] =>
  outcome.logs.length === 0 ? [] : [
    element('p', { className: 'playground-label', text: '出力' }),
    element('pre', { className: 'playground-log', text: logText(outcome) }),
  ];

const renderTests = (tests: NonNullable<RunOutcome['tests']>): HTMLElement[] => {
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
      failed.map((test) =>
        element('li', {}, [
          element('strong', { text: [...test.path, test.name].join(' > ') }),
          element('pre', { text: test.message ?? '' }),
        ])
      ),
    ));
  }
  return elements;
};

const renderOutcome = (outcome: RunOutcome, kind: 'tests' | 'script'): HTMLElement[] => {
  if (outcome.error !== null) {
    return [
      element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
        element('p', { text: 'コードを最後まで実行できませんでした' }),
        element('pre', { text: outcome.error }),
      ]),
      ...renderLogs(outcome),
    ];
  }
  if (kind === 'tests') {
    return [
      ...(outcome.tests === null
        ? [element('p', { className: 'playground-note', text: 'このファイルにテストが見つかりませんでした' })]
        : renderTests(outcome.tests)),
      ...renderLogs(outcome),
    ];
  }
  return outcome.logs.length === 0
    ? [element('p', { className: 'playground-note', text: '最後まで実行しました。出力はありません' })]
    : renderLogs(outcome);
};

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as CodeConfig;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const output = query<HTMLElement>(root, '[data-role="output"]');
  const editorParent = query<HTMLElement>(root, '[data-role="editor"]');
  const resetButton = query<HTMLButtonElement>(root, '[data-role="reset"]');
  const retryButton = query<HTMLButtonElement>(root, '[data-role="retry"]');
  const completeButton = root.querySelector<HTMLButtonElement>('[data-role="complete"]');
  const runButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-run-file]')];
  const shown = [...config.editable, ...config.readonly];
  let busy = false;

  const stateFor = (file: string, doc: string): EditorState =>
    createEditorState(doc, {
      language: 'typescript',
      label: `${file} のコード`,
      readOnly: !config.editable.includes(file),
      onChange: () => persist(),
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

  const select = (file: string): void => {
    states.set(active, view.state);
    active = file;
    view.setState(states.get(file) ?? stateFor(file, ''));
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
      output.replaceChildren(
        element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
          element('p', {
            text: error instanceof RuntimeTimeoutError
              ? `実行に ${
                executionLimitMs / 1000
              } 秒以上かかったため、途中で止めました。終わらない繰り返しがないか確かめてください`
              : '実行できませんでした',
          }),
          ...(error instanceof RuntimeTimeoutError || !(error instanceof Error)
            ? []
            : [element('pre', { text: error.message })]),
        ]),
      );
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
  resetButton.addEventListener('click', () => {
    clearEdits(config.exerciseId);
    replaceDocs(config.files);
  });
  completeButton?.addEventListener('click', () => {
    if (config.complete === null) {
      return;
    }
    replaceDocs(config.complete.files);
    persist();
  });
  retryButton.addEventListener('click', () => runtime.reload());
  select(active);
  updateControls();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-playground="code"]')) {
  mount(root);
}
