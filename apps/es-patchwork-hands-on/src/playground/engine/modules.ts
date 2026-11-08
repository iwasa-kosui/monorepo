import { transform } from 'sucrase';

import type { RunConsole } from './console.ts';

type ModuleRecord = { exports: unknown };
type ModuleFunction = (
  require: (specifier: string) => unknown,
  module: ModuleRecord,
  exports: unknown,
  console: RunConsole,
) => unknown;

const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new(
  ...args: string[]
) => ModuleFunction;

export const stripTypes = (source: string, fileName: string): string => {
  try {
    return transform(source, {
      transforms: ['typescript', 'imports'],
      filePath: fileName,
      disableESTransforms: true,
    }).code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`${fileName}: ${message}`);
  }
};

const resolveSpecifier = (from: string, specifier: string): string => {
  const slash = from.lastIndexOf('/');
  const parts = [...(slash === -1 ? [] : from.slice(0, slash).split('/')), ...specifier.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }
  return resolved.join('/');
};

export const runEntry = async (options: {
  files: Readonly<Record<string, string>>;
  entry: string;
  shims: Readonly<Record<string, unknown>>;
  console: RunConsole;
}): Promise<void> => {
  const { files, shims, console } = options;
  const cache = new Map<string, ModuleRecord>();

  const requireFrom = (from: string) => (specifier: string): unknown => {
    if (Object.hasOwn(shims, specifier)) {
      return shims[specifier];
    }
    if (!specifier.startsWith('.')) {
      throw new Error(`この実行環境では ${specifier} を読み込めません`);
    }
    const resolved = resolveSpecifier(from, specifier);
    const name = [resolved, `${resolved}.ts`].find((candidate) => Object.hasOwn(files, candidate));
    if (name === undefined) {
      throw new Error(`Cannot find module '${specifier}' imported from '${from}'`);
    }
    return load(name);
  };

  const load = (name: string): unknown => {
    const cached = cache.get(name);
    if (cached !== undefined) {
      return cached.exports;
    }
    const record: ModuleRecord = { exports: {} };
    cache.set(name, record);
    const compiled = new Function('require', 'module', 'exports', 'console', stripTypes(files[name] ?? '', name));
    (compiled as ModuleFunction)(requireFrom(name), record, record.exports, console);
    return record.exports;
  };

  const entrySource = files[options.entry];
  if (entrySource === undefined) {
    throw new Error(`${options.entry} が見つかりません`);
  }
  const record: ModuleRecord = { exports: {} };
  cache.set(options.entry, record);
  const body = stripTypes(entrySource, options.entry);
  const compiled = new AsyncFunction('require', 'module', 'exports', 'console', body);
  await compiled(requireFrom(options.entry), record, record.exports, console);
};
