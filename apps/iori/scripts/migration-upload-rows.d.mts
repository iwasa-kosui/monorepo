export type LocalUpload = {
  kind: 'local';
  uuid: string;
  filename: string;
  key: string;
  contentType: string;
};
export type UploadClassification = LocalUpload | { kind: 'remote' } | { kind: 'legacy' } | { kind: 'invalid' };

export function classifyUploadUrl(url: unknown): UploadClassification;

export function createUploadTracker(): {
  add(upload: LocalUpload): 'new' | 'duplicate' | 'conflict';
  has(key: string): boolean;
  readonly uniqueCount: number;
  readonly duplicateCount: number;
};
