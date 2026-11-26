const sources = import.meta.glob<string>([
  '../../../node_modules/typescript/lib/lib.*.d.ts',
  '!../../../node_modules/typescript/lib/lib.d.ts',
  '!../../../node_modules/typescript/lib/lib.es6.d.ts',
  '!../../../node_modules/typescript/lib/lib.dom*.d.ts',
  '!../../../node_modules/typescript/lib/lib.webworker*.d.ts',
  '!../../../node_modules/typescript/lib/lib.scripthost.d.ts',
  '!../../../node_modules/typescript/lib/lib.*.full.d.ts',
], { query: '?raw', import: 'default', eager: true });

export const libFiles: ReadonlyMap<string, string> = new Map(
  Object.entries(sources).map((
    [path, source],
  ): [string, string] => [`/${path.slice(path.lastIndexOf('/') + 1)}`, source]),
);
