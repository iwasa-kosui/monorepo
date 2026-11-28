export type FileTree = {
  readonly dirs: readonly DirNode[];
  readonly files: readonly string[];
};

export type DirNode = FileTree & {
  readonly name: string;
  readonly path: string;
};

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

type MutableDir = { name: string; path: string; dirs: Map<string, MutableDir>; files: string[] };

const freeze = (dir: MutableDir): DirNode => ({
  name: dir.name,
  path: dir.path,
  dirs: [...dir.dirs.values()].sort((left, right) => compare(left.name, right.name)).map(freezeCompact),
  files: [...dir.files].sort((left, right) => compare(baseName(left), baseName(right))),
});

const freezeCompact = (dir: MutableDir): DirNode => {
  const frozen = freeze(dir);
  const [only] = frozen.dirs;
  return frozen.files.length === 0 && frozen.dirs.length === 1 && only !== undefined
    ? { name: `${frozen.name}/${only.name}`, path: only.path, dirs: only.dirs, files: only.files }
    : frozen;
};

export const buildFileTree = (paths: readonly string[]): FileTree => {
  const root: MutableDir = { name: '', path: '', dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let current = root;
    for (const [index, part] of parts.slice(0, -1).entries()) {
      const dirPath = parts.slice(0, index + 1).join('/');
      const next = current.dirs.get(part) ?? { name: part, path: dirPath, dirs: new Map(), files: [] };
      current.dirs.set(part, next);
      current = next;
    }
    current.files.push(path);
  }
  const { dirs, files } = freeze(root);
  return { dirs, files };
};
