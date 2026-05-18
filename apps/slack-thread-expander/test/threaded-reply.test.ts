import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { findThreadedReply } from '../src/domain/threaded-reply.ts';
import { SlackMessageSchema } from '../src/slack/schema.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

type EnvelopeFixture = {
  payload: {
    event: unknown;
  };
};

const loadEventFixture = (filename: string) => {
  const raw = readFileSync(join(fixturesDir, filename), 'utf8');
  const envelope = JSON.parse(raw) as EnvelopeFixture;
  return SlackMessageSchema.parse(envelope.payload.event);
};

describe('findThreadedReply', () => {
  it('ignores plain message (no thread_ts)', () => {
    const message = loadEventFixture('plain_message.json');
    expect(findThreadedReply('C03387UAMQR', message)).toBeNull();
  });

  it('finds threaded message', () => {
    const message = loadEventFixture('threaded_message.json');
    expect(findThreadedReply('C03387UAMQR', message)).toEqual({
      channel: 'C03387UAMQR',
      ts: '1644939337.956639',
    });
  });

  it('ignores edited threaded message (subtype=message_changed)', () => {
    const message = loadEventFixture('threaded_message_changed.json');
    expect(findThreadedReply('C03387UAMQR', message)).toBeNull();
  });

  it('ignores broadcasted threaded message (subtype=thread_broadcast)', () => {
    const message = loadEventFixture('broadcasted_threaded_message.json');
    expect(findThreadedReply('C03387UAMQR', message)).toBeNull();
  });

  it('ignores edited broadcasted threaded message', () => {
    const message = loadEventFixture(
      'broadcasted_threaded_message_changed.json',
    );
    expect(findThreadedReply('C03387UAMQR', message)).toBeNull();
  });

  it('finds threaded file upload (subtype=file_share)', () => {
    const message = loadEventFixture('threaded_file_upload.json');
    expect(findThreadedReply('C03387UAMQR', message)).toEqual({
      channel: 'C03387UAMQR',
      ts: '1644940789.277819',
    });
  });

  it('ignores broadcasted threaded file upload', () => {
    const message = loadEventFixture('broadcasted_threaded_file_upload.json');
    expect(findThreadedReply('C03387UAMQR', message)).toBeNull();
  });
});
