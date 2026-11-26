import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { EditorView, hoverTooltip } from '@codemirror/view';

import { element } from '../dom.ts';
import { createTypecheckClient, type TypecheckClient } from './client.ts';

const wordPattern = /[\w$]*/;
const wordOnly = /^[\w$]*$/;

const theme = EditorView.theme({
  '.cm-tooltip': {
    backgroundColor: 'var(--role-surface)',
    color: 'var(--role-fg)',
    border: '1px solid var(--role-border)',
    fontFamily: 'var(--font-code)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--role-accent-soft)',
    color: 'var(--role-fg)',
  },
  '.cm-typecheck-info': {
    padding: '0.25rem 0.5rem',
    maxWidth: '36rem',
    whiteSpace: 'pre-wrap',
    fontSize: 'var(--text-note)',
  },
});

export const createTypecheckExtensions = (
  files: Readonly<Record<string, string>>,
  editable: readonly string[],
): ReadonlyMap<string, Extension> => {
  const client = createTypecheckClient(files);
  return new Map(editable.map((file): [string, Extension] => [file, extensionFor(client, file)]));
};

const extensionFor = (client: TypecheckClient, file: string): Extension => {
  const diagnose = async (view: EditorView): Promise<Diagnostic[]> => {
    const text = view.state.doc.toString();
    const found = await client.diagnostics(file, text);
    if (found === null || view.state.doc.toString() !== text) {
      return [];
    }
    return found.map((entry) => {
      const empty = entry.from >= entry.to;
      const from = empty && entry.from > 0 && entry.from >= text.length ? entry.from - 1 : entry.from;
      const to = empty ? Math.min(from + 1, text.length) : entry.to;
      return { from, to, severity: entry.severity, message: entry.message };
    });
  };

  const complete = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(wordPattern);
    const from = word?.from ?? context.pos;
    const trigger = context.state.sliceDoc(Math.max(from - 1, 0), from) === '.' ? '.' : null;
    if (!context.explicit && from === context.pos && trigger === null) {
      return null;
    }
    const found = await client.completions(file, context.state.doc.toString(), context.pos, trigger);
    if (found === null || found.length === 0 || context.aborted) {
      return null;
    }
    return { from, options: found, validFor: wordOnly };
  };

  const hover = hoverTooltip(async (view, position) => {
    const text = view.state.doc.toString();
    const info = await client.quickInfo(file, text, position);
    if (info === null || view.state.doc.toString() !== text) {
      return null;
    }
    return {
      pos: info.from,
      end: info.to,
      above: true,
      create: () => ({ dom: element('div', { className: 'cm-typecheck-info', text: info.text }) }),
    };
  });

  return [
    linter(diagnose, { delay: 300 }),
    lintGutter(),
    autocompletion({ override: [complete] }),
    hover,
    theme,
  ];
};
