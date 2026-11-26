import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs';
import type ts from 'typescript';
import japanese from 'typescript/lib/ja/diagnosticMessages.generated.json?raw';

import { ambientDeclarations, ambientPath } from './ambient.ts';
import { libFiles } from './libs.ts';
import { compilerOptionsOf } from './options.ts';
import type { TypecheckCompletion, TypecheckDiagnostic, TypecheckQuickInfo } from './protocol.ts';

type Ts = typeof ts;

export type TypecheckService = {
  readonly diagnostics: (file: string, text: string) => TypecheckDiagnostic[];
  readonly completions: (
    file: string,
    text: string,
    position: number,
    trigger: string | null,
  ) => TypecheckCompletion[];
  readonly quickInfo: (file: string, text: string, position: number) => TypecheckQuickInfo | null;
};

const kinds: Readonly<Record<string, string>> = {
  method: 'method',
  function: 'function',
  'local function': 'function',
  construct: 'function',
  property: 'property',
  getter: 'property',
  setter: 'property',
  'JSX attribute': 'property',
  class: 'class',
  'local class': 'class',
  interface: 'interface',
  type: 'type',
  'type parameter': 'type',
  alias: 'type',
  enum: 'enum',
  'enum member': 'constant',
  keyword: 'keyword',
  module: 'namespace',
  string: 'text',
  const: 'constant',
};

const severityOf = (typescript: Ts, category: ts.DiagnosticCategory): TypecheckDiagnostic['severity'] =>
  category === typescript.DiagnosticCategory.Error
    ? 'error'
    : category === typescript.DiagnosticCategory.Warning
    ? 'warning'
    : 'info';

const localize = (typescript: Ts): void => {
  const setMessages = (typescript as unknown as {
    setLocalizedDiagnosticMessages?: (messages: Record<string, string> | undefined) => void;
  }).setLocalizedDiagnosticMessages;
  setMessages?.(JSON.parse(japanese) as Record<string, string>);
};

export const createTypecheckService = (
  typescript: Ts,
  files: Readonly<Record<string, string>>,
): TypecheckService => {
  localize(typescript);
  const map = new Map<string, string>(libFiles);
  map.set('/package.json', '{"type":"module"}');
  map.set(ambientPath, ambientDeclarations);
  const roots = [ambientPath];
  for (const [name, text] of Object.entries(files)) {
    if (name.endsWith('.ts')) {
      map.set(`/${name}`, text);
      roots.push(`/${name}`);
    }
  }
  const environment = createVirtualTypeScriptEnvironment(
    createSystem(map),
    roots,
    typescript,
    compilerOptionsOf(typescript),
  );
  const service = environment.languageService;
  const current = new Map<string, string>(Object.entries(files).map(([name, text]) => [`/${name}`, text]));

  const sync = (file: string, text: string): string => {
    const path = `/${file}`;
    if (current.get(path) !== text) {
      if (current.has(path)) {
        environment.updateFile(path, text);
      } else {
        environment.createFile(path, text);
      }
      current.set(path, text);
    }
    return path;
  };

  const diagnostics = (file: string, text: string): TypecheckDiagnostic[] => {
    const path = sync(file, text);
    return [...service.getSyntacticDiagnostics(path), ...service.getSemanticDiagnostics(path)].map((diagnostic) => {
      const from = Math.min(diagnostic.start ?? 0, text.length);
      const to = Math.min(from + (diagnostic.length ?? 0), text.length);
      return {
        from,
        to,
        severity: severityOf(typescript, diagnostic.category),
        message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      };
    });
  };

  const completions = (
    file: string,
    text: string,
    position: number,
    trigger: string | null,
  ): TypecheckCompletion[] => {
    const path = sync(file, text);
    const result = service.getCompletionsAtPosition(path, position, {
      ...(trigger === '.' ? { triggerCharacter: '.' as const } : {}),
      includeCompletionsWithInsertText: false,
    });
    if (result === undefined) {
      return [];
    }
    return result.entries
      .filter((entry) => entry.replacementSpan === undefined)
      .map((entry) => ({
        label: entry.name,
        type: kinds[entry.kind] ?? 'variable',
        boost: (19 - (Number.parseInt(entry.sortText, 10) || 19)) * 5,
        ...(entry.insertText !== undefined && entry.insertText !== entry.name ? { apply: entry.insertText } : {}),
      }));
  };

  const quickInfo = (file: string, text: string, position: number): TypecheckQuickInfo | null => {
    const path = sync(file, text);
    const info = service.getQuickInfoAtPosition(path, position);
    if (info === undefined) {
      return null;
    }
    const signature = typescript.displayPartsToString(info.displayParts);
    const documentation = typescript.displayPartsToString(info.documentation);
    return {
      from: info.textSpan.start,
      to: info.textSpan.start + info.textSpan.length,
      text: documentation === '' ? signature : `${signature}\n\n${documentation}`,
    };
  };

  return { diagnostics, completions, quickInfo };
};
