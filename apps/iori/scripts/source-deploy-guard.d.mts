type DirectoryStat = {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  uid: number;
  mode: number;
  dev: number;
  ino: number;
};
export function assertSourceDeployAllowed(input: { home: string; uid: number }, fs?: {
  lstat(path: string): Promise<DirectoryStat>;
  realpath(path: string): Promise<string>;
}): Promise<void>;
