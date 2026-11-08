import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { sql, SQLite } from '@codemirror/lang-sql';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension, Prec } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';

export type EditorOptions = {
  language: 'sql' | 'typescript';
  label: string;
  readOnly?: boolean;
  onChange?: (doc: string) => void;
  onRun?: () => void;
};

const theme = EditorView.theme({
  '&': { maxHeight: '22rem', fontSize: '0.875rem', backgroundColor: '#fff' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  '.cm-gutters': { backgroundColor: '#f3f4f6', color: '#6b7280', border: 'none' },
});

export const createEditorState = (doc: string, options: EditorOptions): EditorState => {
  const extensions: Extension[] = [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle),
    options.language === 'sql' ? sql({ dialect: SQLite }) : javascript({ typescript: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.contentAttributes.of({ 'aria-label': options.label }),
    theme,
  ];
  if (options.readOnly === true) {
    extensions.push(EditorState.readOnly.of(true));
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
  return EditorState.create({ doc, extensions });
};

export const createEditorView = (parent: HTMLElement, state: EditorState): EditorView =>
  new EditorView({ state, parent });

export const revealText = (view: EditorView, text: string): void => {
  const index = view.state.doc.toString().indexOf(text);
  if (index !== -1) {
    requestAnimationFrame(() => {
      view.dispatch({ effects: EditorView.scrollIntoView(index, { y: 'start', yMargin: 0 }) });
    });
  }
};
