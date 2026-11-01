export type LocalUpload = {
  kind: 'local';
  uuid: string;
  filename: string;
  key: string;
  contentType: string;
};
export type UploadClassification =
  | LocalUpload
  | { kind: 'remote' }
  | { kind: 'same-origin' }
  | { kind: 'legacy' }
  | { kind: 'invalid' };

export function requireSourceHostname(sourceOrigin: unknown): string;

export function classifyUploadUrl(url: unknown, sourceHostname?: string): UploadClassification;

export function createUploadTracker(): {
  add(upload: LocalUpload): 'new' | 'duplicate' | 'conflict';
  has(key: string): boolean;
  readonly uniqueCount: number;
  readonly duplicateCount: number;
};
