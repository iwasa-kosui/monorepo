import type ts from 'typescript';

type Ts = typeof ts;

export const compilerOptionsOf = (typescript: Ts): ts.CompilerOptions => ({
  target: typescript.ScriptTarget.ESNext,
  module: typescript.ModuleKind.NodeNext,
  moduleResolution: typescript.ModuleResolutionKind.NodeNext,
  lib: ['esnext'],
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  erasableSyntaxOnly: true,
  verbatimModuleSyntax: true,
});
