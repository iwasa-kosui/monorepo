import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { sql, SQLite } from '@codemirror/lang-sql';
import {
  bracketMatching,
  codeFolding,
  ensureSyntaxTree,
  foldable,
  foldEffect,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState, type Extension, Prec, type StateEffect } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export type EditorOptions = {
  language: 'sql' | 'typescript';
  label: string;
  readOnly?: boolean;
  wrap?: boolean;
  foldExportsExcept?: string;
  typecheck?: Extension;
  onChange?: (doc: string) => void;
  onCursor?: (line: number, column: number) => void;
  onRun?: () => void;
};

const theme = EditorView.theme({
  '&': {
    maxHeight: '22rem',
    fontSize: 'var(--text-code)',
    backgroundColor: 'var(--role-ground)',
    color: 'var(--role-ink)',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-code)', lineHeight: 'var(--leading-normal)' },
  '.cm-gutters': { backgroundColor: 'var(--role-ground)', color: 'var(--role-ink-sub)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '2.5rem', padding: '0 var(--space-2)' },
  '.cm-foldGutter .cm-gutterElement': { minWidth: 'var(--tap-min)', textAlign: 'center', cursor: 'pointer' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--role-surface)',
    color: 'var(--role-ink-sub)',
    border: 'none',
    fontSize: 'var(--text-note)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--role-ink)' },
  '.cm-selectionBackground': { backgroundColor: '#cfe3ff' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: '#cfe3ff' },
  '.cm-activeLine': { backgroundColor: '#f3f3f3' },
  '.cm-activeLineGutter': { backgroundColor: '#f3f3f3', color: 'var(--role-ink)' },
});

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword],
    color: '#0000ff',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#a31515' },
  { tag: [tags.number, tags.bool, tags.null], color: '#0b6b3a' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--role-ink-sub)', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.propertyName)],
    color: '#795e26',
  },
  { tag: [tags.typeName, tags.className], color: '#1f6f86' },
  {
    tag: [tags.variableName, tags.propertyName, tags.operator, tags.punctuation, tags.bracket, tags.name],
    color: 'var(--role-ink)',
  },
]);

const exportPattern = /^export const (\w+)/gm;

const foldedExports = (state: EditorState, except: string): StateEffect<{ from: number; to: number }>[] => {
  ensureSyntaxTree(state, state.doc.length, 1000);
  const effects: StateEffect<{ from: number; to: number }>[] = [];
  for (const match of state.doc.toString().matchAll(exportPattern)) {
    if (match[1] === except) {
      continue;
    }
    const line = state.doc.lineAt(match.index);
    const range = foldable(state, line.from, line.to);
    if (range !== null) {
      effects.push(foldEffect.of(range));
    }
  }
  return effects;
};

export const createEditorState = (doc: string, options: EditorOptions): EditorState => {
  const extensions: Extension[] = [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    syntaxHighlighting(highlightStyle),
    options.language === 'sql' ? sql({ dialect: SQLite }) : javascript({ typescript: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.contentAttributes.of({ 'aria-label': options.label }),
    theme,
  ];
  if (options.readOnly === true) {
    extensions.push(EditorState.readOnly.of(true));
  }
  if (options.wrap === true) {
    extensions.push(EditorView.lineWrapping);
  }
  if (options.foldExportsExcept !== undefined) {
    extensions.push(codeFolding(), foldGutter(), keymap.of(foldKeymap));
  }
  if (options.typecheck !== undefined) {
    extensions.push(options.typecheck);
  }
  if (options.onCursor !== undefined) {
    const onCursor = options.onCursor;
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        const { line, column } = cursorOf(update.state);
        onCursor(line, column);
      }
    }));
  }
  if (options.onRun !== undefined) {
    const run = options.onRun;
    const runOnShortcut = (): boolean => {
      run();
      return true;
    };
    extensions.push(Prec.highest(keymap.of([
      { key: 'Ctrl-Enter', run: runOnShortcut },
      { key: 'Meta-Enter', run: runOnShortcut },
    ])));
  }
  if (options.onChange !== undefined) {
    const onChange = options.onChange;
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }));
  }
  const state = EditorState.create({ doc, extensions });
  if (options.foldExportsExcept === undefined) {
    return state;
  }
  return state.update({ effects: foldedExports(state, options.foldExportsExcept) }).state;
};

export const cursorOf = (state: EditorState): { line: number; column: number } => {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
};

export const createEditorView = (parent: HTMLElement, state: EditorState): EditorView =>
  new EditorView({ state, parent });

// EditorView.scrollIntoView は、編集欄の外側のスクロール領域も動かす。狭い画面で編集欄より上の
// 内容が画面の外へ出ないよう、編集欄の中だけを動かす
export const revealText = (view: EditorView, text: string, margin = 0): void => {
  const index = view.state.doc.toString().indexOf(text);
  if (index === -1) {
    return;
  }
  requestAnimationFrame(() => {
    view.requestMeasure({
      read: () => view.lineBlockAt(Math.min(index, view.state.doc.length)).top,
      write: (top) => {
        view.scrollDOM.scrollTop = Math.max(top - margin, 0);
      },
    });
  });
};
