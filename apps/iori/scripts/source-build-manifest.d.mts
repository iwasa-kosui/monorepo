export interface SourceBuildManifest {
  sha: string;
  files: { path: string; bytes: number; sha256: string }[];
}
export function inspectSourceDistDirectory(root: string, uid: number, create?: boolean): Promise<void>;
export function validateSourceBuildManifest(manifest: unknown, sha: string): SourceBuildManifest;
export function createSourceBuildManifest(
  root: string,
  sha: string,
  options?: { uid?: number; signal?: AbortSignal },
): Promise<SourceBuildManifest>;
export function verifySourceBuildManifest(
  root: string,
  manifest: SourceBuildManifest,
  sha: string,
  options?: { uid?: number; signal?: AbortSignal },
): Promise<void>;
