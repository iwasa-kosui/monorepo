import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { UseBlueskyReplyDialogReturn } from '../hooks/useBlueskyReplyDialog.ts';
import { BlueskyReplyModal } from './BlueskyReplyModal.tsx';

const target = (overrides: Partial<IoriBlueskyTimelineItemBody> = {}): IoriBlueskyTimelineItemBody =>
  ({
    authorHandle: 'a.bsky.social',
    authorDisplayName: 'A',
    text: 'hello',
    ...overrides,
  }) as IoriBlueskyTimelineItemBody;

const render = (overrides: Partial<UseBlueskyReplyDialogReturn> = {}): string =>
  String(jsx(
    BlueskyReplyModal as never,
    {
      dialog: {
        target: target(),
        content: '',
        isSending: false,
        errorText: undefined,
        open: () => {},
        close: () => {},
        setContent: () => {},
        send: async () => true,
        ...overrides,
      },
    },
  ));

describe('BlueskyReplyModal', () => {
  it('renders nothing without a target', () => {
    expect(render({ target: null })).toBe('');
  });

  it('shows the target author, the excerpt and the remaining count', () => {
    const html = render({ content: 'abc' });

    expect(html).toContain('A');
    expect(html).toContain('@a.bsky.social');
    expect(html).toContain('hello');
    expect(html).toContain('>297<');
  });

  it('falls back to the handle when the target has no display name', () => {
    expect(render({ target: target({ authorDisplayName: null }) })).toContain('>a.bsky.social<');
  });

  it('shows a negative remaining count and keeps the submit disabled over 300 graphemes', () => {
    const html = render({ content: 'x'.repeat(301) });

    expect(html).toContain('>-1<');
    expect(html).toContain('text-terracotta font-medium');
    expect(html).toContain('disabled');
  });

  it('shows the sending label and the error text', () => {
    expect(render({ isSending: true, content: 'abc' })).toContain('送信中...');
    expect(render({ errorText: 'この投稿には返信できません' })).toContain('この投稿には返信できません');
  });
});
