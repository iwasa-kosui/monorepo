import ignore, { type Ignore } from 'ignore';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type FileNode = Readonly<{
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  children?: readonly FileNode[];
}>;

type IgnoreContext = Readonly<{
  ig: Ignore;
  basePath: string;
}>;

const loadGitignore = (dirPath: string): Ignore => {
  const ig = ignore();
  const gitignorePath = path.join(dirPath, '.gitignore');

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  }

  // Always ignore common patterns
  ig.add(['.git', 'node_modules', '.DS_Store']);

  return ig;
};

const collectIgnoreContexts = (rootPath: string, currentPath: string): readonly IgnoreContext[] => {
  const contexts: IgnoreContext[] = [];
  let dir = currentPath;

  while (dir.startsWith(rootPath)) {
    const ig = loadGitignore(dir);
    contexts.unshift({ ig, basePath: dir });
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return contexts;
};

const isIgnored = (
  filePath: string,
  rootPath: string,
  contexts: readonly IgnoreContext[],
): boolean => {
  for (const ctx of contexts) {
    const relativePath = path.relative(ctx.basePath, filePath);
    if (relativePath && !relativePath.startsWith('..') && ctx.ig.ignores(relativePath)) {
      return true;
    }
  }
  return false;
};

const scanDirectory = (
  dirPath: string,
  rootPath: string,
  ignoreContexts: readonly IgnoreContext[],
): FileNode[] => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    // Check if ignored by any gitignore in the hierarchy
    const contexts = [...ignoreContexts];
    if (entry.isDirectory()) {
      const dirIg = loadGitignore(fullPath);
      contexts.push({ ig: dirIg, basePath: fullPath });
    }

    if (isIgnored(fullPath, rootPath, contexts)) {
      continue;
    }

    if (entry.isDirectory()) {
      const children = scanDirectory(fullPath, rootPath, contexts);
      // Only include directories that have markdown files
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          type: 'directory',
          children,
        });
      }
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        relativePath,
        type: 'file',
      });
    }
  }

  // Sort: directories first, then files, alphabetically
  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
};

export const buildFileTree = (rootPath: string): FileNode => {
  const absoluteRoot = path.resolve(rootPath);
  const ignoreContexts = collectIgnoreContexts(absoluteRoot, absoluteRoot);
  const children = scanDirectory(absoluteRoot, absoluteRoot, ignoreContexts);

  return {
    name: path.basename(absoluteRoot),
    path: absoluteRoot,
    relativePath: '',
    type: 'directory',
    children,
  };
};

export const flattenMarkdownFiles = (node: FileNode): readonly string[] => {
  if (node.type === 'file') {
    return [node.path];
  }

  const files: string[] = [];
  for (const child of node.children ?? []) {
    files.push(...flattenMarkdownFiles(child));
  }
  return files;
};
