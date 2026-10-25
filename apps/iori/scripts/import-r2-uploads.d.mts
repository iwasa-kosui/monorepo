export interface BucketPutOptions {
  httpMetadata: { contentType: string; cacheControl: string };
  customMetadata: Record<string, string>;
}

export interface MigrationBucket {
  put(key: string, body: Uint8Array, options: BucketPutOptions): Promise<unknown>;
}

export interface ImportedObject {
  key: string;
  contentType: string;
  checksum: string;
}

export function importR2Uploads(input: {
  sourceDir: string;
  bucket: MigrationBucket;
  manifestPath: string;
  outputDir: string;
}): Promise<{ schemaVersion: number; objects: ImportedObject[]; manifestPath: string }>;

export function backfillPublishedOgpImages(input: {
  articles: readonly { articleId: string; status: string; title: string }[];
  bucket: MigrationBucket;
  generate(title: string): Promise<Uint8Array>;
  outputDir: string;
}): Promise<{ objects: ImportedObject[]; manifestPath: string }>;

export function createWranglerBucket(
  bucketName: string,
  options?: { executeFile?: (command: string, args: readonly string[]) => Promise<unknown> },
): MigrationBucket;
