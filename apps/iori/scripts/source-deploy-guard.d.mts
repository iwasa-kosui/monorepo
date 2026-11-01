type DirectoryStat = {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  uid: number;
  mode: number;
  dev: number;
  ino: number;
};
type GuardFileSystem = {
  lstat(path: string): Promise<DirectoryStat>;
  realpath(path: string): Promise<string>;
};
export function assertSourceControlDirectory(
  input: { home: string; uid: number },
  fs?: GuardFileSystem,
  between?: (base: string) => Promise<void>,
): Promise<void>;
export function assertSourceDeployAllowed(input: { home: string; uid: number }, fs?: GuardFileSystem): Promise<void>;
