import type { SourceBuildManifest } from './source-build-manifest.mjs';
export function inspectSourcePnpm(path: string, uid: number): Promise<void>;
export function runSourceDeployStep(input: { phase: string; sha: string; manifest?: SourceBuildManifest }, options?: {
  home?: string;
  uid?: number;
  signal?: AbortSignal;
  guard?: (input: { home: string; uid: number }) => Promise<void>;
  inspectPnpm?: (path: string, uid: number) => Promise<void>;
  inspectCheckout?: (home: string, uid: number) => Promise<void>;
  runCommand?: (program: string, args: string[], options: object) => Promise<{ stdout: string; stderr: string }>;
}): Promise<void>;
