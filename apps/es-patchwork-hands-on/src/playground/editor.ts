import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { sql, SQLite } from '@codemirror/lang-sql';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension, Prec } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export type EditorOptions = {
  language: 'sql' | 'typescript';
  label: string;
  readOnly?: boolean;
  onChange?: (doc: string) => void;
  onRun?: () => void;
};

const theme = EditorView.theme({
  '&': { maxHeight: '22rem', fontSize: '0.875rem', backgroundColor: 'var(--role-surface)', color: 'var(--role-fg)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-code)' },
  '.cm-gutters': { backgroundColor: 'var(--role-sunken)', color: 'var(--role-muted)', border: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--role-fg)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--role-accent-soft)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--role-accent-soft)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--role-accent-soft) 40%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--role-accent-soft) 40%, transparent)' },
});

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword],
    color: 'var(--role-code-keyword)',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--role-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--role-code-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--role-code-comment)', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.propertyName)],
    color: 'var(--role-code-function)',
  },
  { tag: [tags.typeName, tags.className], color: 'var(--role-code-type)' },
  {
    tag: [tags.variableName, tags.propertyName, tags.operator, tags.punctuation, tags.bracket, tags.name],
    color: 'var(--role-fg)',
  },
]);

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
