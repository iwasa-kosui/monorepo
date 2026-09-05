import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, mkdir, open, realpath, statfs, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { z } from 'zod';

import {
  APPLICATION_TABLE_ORDER,
  exportPostgres,
  type PostgresExportClient,
} from '../../../../scripts/export-postgres-lib.mjs';
import {
  assertExternalMigrationPath,
  assertExternalMigrationRoot,
} from '../../../../scripts/migration-path-safety.mjs';
import {
  logicalFilePath,
  SOURCE_LIMITS,
  type SourceFile,
  type SourceIdentity,
  sourceIdentitySchema,
  type SourceInventory,
  validateSourceInventory,
} from '../../../../scripts/source-transfer-protocol.mjs';
import { validatePrivateDirectory } from './sourceControl.ts';

export type FileTransfer = (metadata: SourceFile, stream: Readable) => Promise<void>;
const number = z.coerce.number().int().nonnegative().safe();
const upload = z.object({ imageId: z.string().uuid(), url: z.string() });
const fileInfo = async (path: string, maxBytes: number, privateFile = true) => {
  if (await realpath(dirname(path)) !== dirname(path)) throw new Error('unsafe_file');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() || stat.size > maxBytes
      || (privateFile && (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600))
    ) throw new Error('unsafe_file');
    return { file, stat };
  } catch (error) {
    await file.close();
    throw error;
  }
};
async function hashOrCopy(path: string, maxBytes: number, signal: AbortSignal, destination?: string) {
  const { file, stat } = await fileInfo(path, maxBytes, destination === undefined);
  let output: Awaited<ReturnType<typeof open>> | undefined;
  let bytes = 0;
  const hash = createHash('sha256');
  const stream = file.createReadStream({ signal });
  try {
    if (destination) output = await open(destination, 'wx', 0o600);
    for await (const chunk of stream) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > maxBytes || bytes > stat.size) throw new Error('file_changed');
      hash.update(chunk);
      await output?.writeFile(chunk);
    }
    if (bytes !== stat.size) throw new Error('file_changed');
    await output?.sync();
    return { bytes, checksum: hash.digest('hex') };
  } finally {
    stream.destroy();
    await file.close();
    await output?.close();
  }
}

export class SourceSnapshot {
  #cache?: { key: string; inventory: SourceInventory; files: Map<string, SourceFile> };
  constructor(
    private readonly options: { base: string; uploadDir: string; createClient: () => Promise<PostgresExportClient> },
  ) {}
  private key(identity: SourceIdentity) {
    const checked = sourceIdentitySchema.parse(identity);
    return `${checked.main_sha}-${checked.run_id}`;
  }
  private runRoot(identity: SourceIdentity) {
    return join(this.options.base, 'exports', this.key(identity));
  }
  async estimate(signal: AbortSignal) {
    const client = await this.options.createClient();
    let tableBytes = 0;
    let uploadBytes = 0;
    let rows = 0;
    let images = 0;
    let articles = 0;
    let closing: Promise<void> | undefined;
    const close = () => closing ??= client.end();
    const abort = () => {
      close().catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await client.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query('SET LOCAL statement_timeout = \'30s\'');
      for (const table of APPLICATION_TABLE_ORDER) {
        signal.throwIfAborted();
        const result = await client.query(
          `SELECT COALESCE(SUM(octet_length(to_jsonb(row)::text) + 1), 0)::text AS bytes, COUNT(*)::text AS count FROM "${table}" AS row`,
        );
        tableBytes += number.parse(result.rows[0]?.bytes);
        rows += number.parse(result.rows[0]?.count);
        if (table === 'articles') articles = number.parse(result.rows[0]?.count);
        if (tableBytes > SOURCE_LIMITS.totalBytes) throw new Error('source_too_large');
      }
      await client.query(
        'DECLARE iori_images NO SCROLL CURSOR FOR SELECT CASE WHEN octet_length(url) <= 128 THEN jsonb_build_object(\'imageId\', "imageId", \'url\', url) ELSE NULL END AS row FROM post_images',
      );
      while (true) {
        signal.throwIfAborted();
        const page = await client.query('FETCH FORWARD 100 FROM iori_images');
        if (page.rows.length > 100) throw new Error('invalid_page');
        if (!page.rows.length) break;
        for (const { row } of page.rows) {
          const path = await this.uploadPath(row);
          const { file, stat } = await fileInfo(path, SOURCE_LIMITS.uploadBytes, false);
          await file.close();
          uploadBytes += stat.size;
          if (++images > SOURCE_LIMITS.inventoryFiles - 32 || tableBytes + uploadBytes > SOURCE_LIMITS.totalBytes) {
            throw new Error('source_too_large');
          }
        }
      }
      await client.query('COMMIT');
      const fs = await statfs(this.options.base);
      const source_free_bytes = number.parse(fs.bavail * fs.bsize);
      const source_required_bytes = tableBytes * 24 + uploadBytes * 2 + 64 * 1024 ** 2;
      const runner_required_bytes = tableBytes * 24 + uploadBytes * 3 + 128 * 1024 ** 2;
      return {
        table_bytes: tableBytes,
        upload_bytes: uploadBytes,
        rows,
        upload_count: images,
        article_count: articles,
        source_free_bytes,
        source_required_bytes,
        runner_required_bytes,
        source_sufficient: source_free_bytes >= source_required_bytes,
        limits: SOURCE_LIMITS,
      };
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch { /* Abort closes connection. */ }
      throw new Error('source_estimate_failed');
    } finally {
      signal.removeEventListener('abort', abort);
      await close();
    }
  }
  private async uploadPath(row: unknown) {
    const parsed = upload.parse(row);
    const match = /^\/uploads\/([0-9a-f-]{36})\.(gif|jpeg|jpg|png|webp)$/i.exec(parsed.url);
    if (!match || match[1].toLowerCase() !== parsed.imageId.toLowerCase()) throw new Error('invalid_upload');
    const root = resolve(this.options.uploadDir);
    if (await realpath(root) !== root) throw new Error('unsafe_upload_root');
    return join(root, `${match[1]}.${match[2]}`);
  }
  async export(identity: SourceIdentity, signal: AbortSignal): Promise<SourceInventory> {
    const parent = join(this.options.base, 'exports');
    await assertExternalMigrationPath(parent);
    await validatePrivateDirectory(parent);
    const root = this.runRoot(identity);
    await mkdir(root, { mode: 0o700 });
    await validatePrivateDirectory(root);
    const inventoryPath = join(root, 'source-inventory.json');
    let published = false;
    try {
      await exportPostgres({ outputDir: join(root, 'export'), createClient: this.options.createClient, signal });
      await mkdir(join(root, 'uploads'), { mode: 0o700 });
      const files: SourceFile[] = [];
      let totalBytes = 0;
      const add = (file: SourceFile) => {
        totalBytes += file.bytes;
        if (totalBytes > SOURCE_LIMITS.totalBytes || files.length >= SOURCE_LIMITS.inventoryFiles) {
          throw new Error('source_too_large');
        }
        files.push(file);
      };
      for (const id of [...APPLICATION_TABLE_ORDER.map((table) => `table.${table}`), 'manifest.export']) {
        const path = logicalFilePath(id);
        add({ id, path, ...await hashOrCopy(join(root, path), SOURCE_LIMITS.totalBytes, signal) });
      }
      const source = createReadStream(join(root, 'export/post_images.ndjson'), { encoding: 'utf8', signal });
      const lines = createInterface({ input: source, crlfDelay: Infinity });
      const seen = new Set<string>();
      try {
        for await (const line of lines) {
          signal.throwIfAborted();
          const original = await this.uploadPath(JSON.parse(line));
          const filename = original.slice(original.lastIndexOf('/') + 1);
          const id = `upload.${filename}`;
          if (seen.has(id)) throw new Error('duplicate_upload');
          seen.add(id);
          const path = logicalFilePath(id);
          add({ id, path, ...await hashOrCopy(original, SOURCE_LIMITS.uploadBytes, signal, join(root, path)) });
        }
      } finally {
        lines.close();
        source.destroy();
      }
      const inventory = validateSourceInventory({ schemaVersion: 1, complete: true, identity, totalBytes, files });
      const text = JSON.stringify(inventory);
      if (Buffer.byteLength(text) > SOURCE_LIMITS.inventoryBytes) throw new Error('inventory_too_large');
      signal.throwIfAborted();
      const file = await open(inventoryPath, 'wx', 0o600);
      published = true;
      try {
        await file.writeFile(text);
        await file.sync();
      } finally {
        await file.close();
      }
      signal.throwIfAborted();
      this.#cache = { key: this.key(identity), inventory, files: new Map(files.map((file) => [file.id, file])) };
      return inventory;
    } catch (error) {
      if (published) await unlink(inventoryPath);
      throw error;
    }
  }
  async inventory(identity: SourceIdentity): Promise<SourceInventory> {
    const key = this.key(identity);
    if (this.#cache?.key === key) return this.#cache.inventory;
    const root = this.runRoot(identity);
    await assertExternalMigrationRoot(root);
    const stat = await lstat(root);
    if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error('unsafe_directory');
    const { file } = await fileInfo(join(root, 'source-inventory.json'), SOURCE_LIMITS.inventoryBytes);
    try {
      const inventory = validateSourceInventory(JSON.parse(await file.readFile('utf8')));
      if (this.key(inventory.identity) !== key) throw new Error('identity_mismatch');
      this.#cache = { key, inventory, files: new Map(inventory.files.map((file) => [file.id, file])) };
      return inventory;
    } finally {
      await file.close();
    }
  }
  async transfer(identity: SourceIdentity, id: string, send: FileTransfer, signal: AbortSignal) {
    await this.inventory(identity);
    const metadata = this.#cache?.files.get(id);
    if (!metadata) throw new Error('unknown_file');
    const path = join(this.runRoot(identity), logicalFilePath(id));
    const { file, stat } = await fileInfo(path, metadata.bytes);
    const stream = file.createReadStream({ signal });
    let complete = false;
    const checked = Readable.from((async function*() {
      let bytes = 0;
      const hash = createHash('sha256');
      for await (const chunk of stream) {
        signal.throwIfAborted();
        bytes += chunk.length;
        if (bytes > metadata.bytes) throw new Error('file_changed');
        hash.update(chunk);
        yield chunk;
      }
      if (bytes !== metadata.bytes || hash.digest('hex') !== metadata.checksum) throw new Error('file_changed');
      complete = true;
    })());
    try {
      if (stat.size !== metadata.bytes) throw new Error('file_changed');
      await send(metadata, checked);
      signal.throwIfAborted();
      if (!complete) throw new Error('incomplete_transfer');
    } finally {
      checked.destroy();
      stream.destroy();
      await file.close();
    }
  }
}
