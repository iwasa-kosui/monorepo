import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

const identitySchema = z.object({
  main_sha: z.string().regex(/^[a-f0-9]{40}$/),
  run_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
}).strict();
const commandSchema = z.discriminatedUnion('op', [
  identitySchema.extend({ op: z.literal('freeze') }),
  identitySchema.extend({ op: z.literal('status') }),
  identitySchema.extend({ op: z.literal('drain'), timeout_ms: z.number().int().min(1).max(300_000) }),
  identitySchema.extend({
    op: z.literal('resume'),
    recovery: z.enum(['destination_writes_not_enabled', 'destination_writes_reconciled']),
  }),
]);
type Identity = z.infer<typeof identitySchema>;
export type SourceQueue = Readonly<{
  pause: () => void;
  resume: () => void;
  snapshot: () => { paused: boolean; dequeueWork: number; enqueueWork: number; failed: boolean };
  depth: () => Promise<number>;
}>;
export const defaultControlBase = () => join(homedir(), '.iori-migration');

export async function validatePrivateDirectory(base: string) {
  if (resolve(base) !== base || await realpath(dirname(base)) !== dirname(base)) {
    throw new Error('unsafe_control_directory');
  }
  await mkdir(base, { mode: 0o700, recursive: false }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw new Error('unsafe_control_directory');
  });
  const stat = await lstat(base);
  if (
    !stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700
  ) {
    throw new Error('unsafe_control_directory');
  }
}
async function syncDirectory(base: string) {
  const directory = await open(base, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
async function readMarker(path: string): Promise<Identity | undefined> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw new Error('invalid_freeze_state');
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size > 1024) {
      throw new Error('invalid_freeze_state');
    }
    return identitySchema.parse(JSON.parse(await file.readFile('utf8')));
  } finally {
    await file.close();
  }
}

// Node runtime lifecycle boundary, independent of application routes and Worker imports.
export class SourceControl {
  #identity?: Identity;
  #frozen = true;
  #invalidState = false;
  #httpInflight = 0;
  #drained = false;
  #busy = false;
  #stopping = false;
  private constructor(readonly base: string, private readonly queue: SourceQueue, private readonly revision?: string) {}
  static async open(
    { base = defaultControlBase(), queue, revision }: { base?: string; queue: SourceQueue; revision?: string },
  ) {
    await validatePrivateDirectory(base);
    const control = new SourceControl(base, queue, revision);
    queue.pause();
    try {
      // An interrupted fsync/rename must never reopen admission on restart.
      try {
        await lstat(join(base, 'freeze.pending'));
        throw new Error('invalid_freeze_state');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      control.#identity = await readMarker(join(base, 'freeze.json'));
      control.#frozen = control.#identity !== undefined;
    } catch {
      control.#invalidState = true;
    }
    if (!control.#frozen) queue.resume();
    return control;
  }
  async fetch(run: () => Response | Promise<Response>): Promise<Response> {
    if (this.#frozen) return new Response('Service unavailable', { status: 503, headers: { 'Retry-After': '60' } });
    this.#httpInflight++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.#httpInflight--;
      }
    };
    try {
      const response = await run();
      if (!response.body) {
        release();
        return response;
      }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await reader.read();
            if (done) {
              controller.close();
              release();
            } else controller.enqueue(value);
          } catch (error) {
            controller.error(error);
            release();
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            release();
          }
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      release();
      throw error;
    }
  }
  async stop() {
    this.#stopping = true;
    this.#frozen = true;
    this.queue.pause();
    while (!this.idle() || this.#busy) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  async command(input: unknown) {
    if (this.#stopping) throw new Error('source_stopping');
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) throw new Error('invalid_command');
    const command = parsed.data;
    if (!this.revision || !/^[a-f0-9]{40}$/.test(this.revision)) throw new Error('revision_unavailable');
    if (this.revision !== command.main_sha) throw new Error('revision_mismatch');
    if (this.#invalidState) throw new Error('invalid_freeze_state');
    if (this.#identity && (this.#identity.main_sha !== command.main_sha || this.#identity.run_id !== command.run_id)) {
      throw new Error('identity_mismatch');
    }
    if (this.#busy) throw new Error('control_busy');
    this.#busy = true;
    try {
      switch (command.op) {
        case 'freeze': {
          this.#frozen = true;
          this.#drained = false;
          this.#identity = { main_sha: command.main_sha, run_id: command.run_id };
          const temporary = join(this.base, 'freeze.pending');
          const file = await open(
            temporary,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o600,
          );
          try {
            await file.writeFile(JSON.stringify(this.#identity));
            await file.sync();
          } finally {
            await file.close();
          }
          await rename(temporary, join(this.base, 'freeze.json'));
          await syncDirectory(this.base);
          break;
        }
        case 'status':
          break;
        case 'drain': {
          if (!this.#frozen || !this.#identity) throw new Error('source_not_frozen');
          this.#drained = false;
          const end = Date.now() + command.timeout_ms;
          const boundedDepth = async () => {
            const remaining = end - Date.now();
            if (remaining <= 0) throw new Error('drain_timeout');
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              return await Promise.race([
                this.queue.depth(),
                new Promise<never>((_, reject) => {
                  timer = setTimeout(() => reject(new Error('drain_timeout')), remaining);
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          };
          try {
            this.queue.resume();
            while (true) {
              if (this.#stopping) throw new Error('source_stopping');
              const depth = await boundedDepth();
              if (this.queue.snapshot().failed) throw new Error('queue_failed');
              if (this.idle() && depth === 0) {
                this.queue.pause();
                if (await boundedDepth() === 0 && this.idle()) {
                  this.#drained = true;
                  break;
                }
                this.queue.resume();
              }
              await new Promise((resolve) => setTimeout(resolve, Math.min(10, Math.max(1, end - Date.now()))));
            }
          } finally {
            this.queue.pause();
          }
          break;
        }
        case 'resume': {
          if (!this.#frozen || !this.#identity) throw new Error('source_not_frozen');
          this.queue.pause();
          if (!this.idle() || this.queue.snapshot().failed) throw new Error('source_not_idle');
          // Never automatically recover a failed queue. A restart under the retained marker is required.
          await unlink(join(this.base, 'freeze.json'));
          await syncDirectory(this.base);
          if (this.#stopping) throw new Error('source_stopping');
          this.queue.resume();
          this.#identity = undefined;
          this.#drained = false;
          this.#frozen = false;
        }
      }
      return await this.report(command.op === 'drain' ? 0 : undefined);
    } catch (error) {
      this.#drained = false;
      if (this.#frozen) this.queue.pause();
      throw error;
    } finally {
      this.#busy = false;
    }
  }
  private idle() {
    const queue = this.queue.snapshot();
    return this.#httpInflight === 0 && queue.dequeueWork === 0 && queue.enqueueWork === 0;
  }
  private async report(verifiedDepth?: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let depth: number;
    try {
      depth = verifiedDepth ?? await Promise.race([
        this.queue.depth(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('status_timeout')), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const queue = this.queue.snapshot();
    return {
      ingress_frozen: this.#frozen,
      http_inflight: this.#httpInflight,
      queue_depth: depth,
      dequeue_work: queue.dequeueWork,
      enqueue_work: queue.enqueueWork,
      consumer_paused: queue.paused,
      queue_failed: queue.failed,
      drained: this.#drained && this.#frozen && this.idle() && queue.paused && !queue.failed && depth === 0,
      identity: this.#identity ?? null,
      source_revision: this.revision,
    };
  }
}
