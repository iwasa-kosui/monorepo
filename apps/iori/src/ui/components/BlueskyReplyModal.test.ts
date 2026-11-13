import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { UseBlueskyReplyDialogReturn } from '../hooks/useBlueskyReplyDialog.ts';
import { DEFAULT_BLUESKY_INTERACTION_DRAFT } from './blueskyInteractionDraft.ts';
import { BlueskyQuoteModal, BlueskyReplyModal } from './BlueskyReplyModal.tsx';

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
        media: {
          uploaded: [],
          isUploading: false,
          hasImages: false,
          slotsLeft: 4,
          notice: null,
          select: async () => {},
          remove: () => {},
          setDescription: () => {},
          markDescriptionSaved: () => {},
          clear: () => {},
        },
        interaction: DEFAULT_BLUESKY_INTERACTION_DRAFT,
        interactionEnabled: false,
        isSending: false,
        errorText: undefined,
        open: () => {},
        close: () => {},
        setContent: () => {},
        setInteraction: () => {},
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

  const uploaded = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `m${i}`,
      url: `https://example.com/${i}.png`,
      description: i === 0 ? 'cat' : '',
      savedDescription: '',
    }));
  const withMedia = (count: number, overrides: Partial<UseBlueskyReplyDialogReturn['media']> = {}) =>
    ({
      media: {
        uploaded: uploaded(count),
        isUploading: false,
        hasImages: count > 0,
        slotsLeft: 4 - count,
        notice: null,
        select: async () => {},
        remove: () => {},
        setDescription: () => {},
        markDescriptionSaved: () => {},
        clear: () => {},
        ...overrides,
      },
    }) satisfies Partial<UseBlueskyReplyDialogReturn>;

  it('shows the attach button but no ALT field without images', () => {
    const html = render();

    expect(html).toContain('type="file"');
    expect(html).not.toContain('説明（ALT）');
  });

  it('shows the previews and the ALT fields with a 1500 character limit', () => {
    const html = render(withMedia(2));

    expect(html).toContain('src="https://example.com/0.png"');
    expect(html).toContain('aria-label="画像1の説明（ALT）"');
    expect(html).toContain('aria-label="画像2の説明（ALT）"');
    expect(html).toContain('maxlength="1500"');
    expect(html).toContain('value="cat"');
  });

  it('shows the notice only when the hook has one', () => {
    const notice = '画像は4枚までです。2枚は追加しませんでした';

    expect(render(withMedia(0))).not.toContain('role="status"');
    expect(render(withMedia(4, { notice }))).toContain(notice);
  });

  it('allows submitting an empty body when an image is attached', () => {
    const empty = render({ content: '' });
    const withImage = render({ content: '', ...withMedia(1) });

    expect(empty).toMatch(/<button[^>]*class="[^"]*cursor-not-allowed[^"]*"[^>]*disabled/);
    expect(withImage).not.toContain('cursor-not-allowed');
  });

  it('disables the attach button at four images', () => {
    expect(render(withMedia(4))).toMatch(/<input[^>]*type="file"[^>]*disabled/);
    expect(render(withMedia(3))).not.toMatch(/<input[^>]*type="file"[^>]*disabled/);
  });

  it('disables attaching, removing and ALT editing while sending', () => {
    const html = render({ isSending: true, ...withMedia(1) });

    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>×/);
    expect(html).toMatch(/<textarea[^>]*aria-label="画像1の説明（ALT）"[^>]*disabled/);
  });

  it('disables submitting while uploading', () => {
    const html = render({ content: 'abc', ...withMedia(0, { isUploading: true }) });

    expect(html).toContain('Uploading...');
    expect(html).toContain('cursor-not-allowed');
  });

  describe('返信できる人と引用の設定', () => {
    it('返信モーダルには出さない', () => {
      const html = render();

      expect(html).not.toContain('aria-label="返信できる人"');
      expect(html).not.toContain('引用を許可しない');
    });

    it('interactionEnabled の引用モーダルには出す', () => {
      const html = String(jsx(BlueskyQuoteModal as never, {
        dialog: {
          target: target(),
          content: '',
          media: {
            uploaded: [],
            isUploading: false,
            hasImages: false,
            slotsLeft: 4,
            notice: null,
            select: async () => {},
            remove: () => {},
            setDescription: () => {},
            markDescriptionSaved: () => {},
            clear: () => {},
          },
          interaction: DEFAULT_BLUESKY_INTERACTION_DRAFT,
          interactionEnabled: true,
          isSending: false,
          errorText: undefined,
          open: () => {},
          close: () => {},
          setContent: () => {},
          setInteraction: () => {},
          send: async () => true,
        },
      }));

      expect(html).toContain('引用して投稿');
      expect(html).toContain('aria-label="返信できる人"');
      expect(html).toContain('引用を許可しない');
    });

    it('interactionEnabled のとき、フックが持つ設定の状態を描画する', () => {
      const html = render({
        interactionEnabled: true,
        interaction: { replyMode: 'selected', audiences: ['mention'], quoteDisabled: true },
      });

      expect(html).toContain('メンションした人');
      expect(html).toMatch(/<input[^>]*name="bluesky-quote-interaction-quote-disabled"[^>]*checked/);
    });
  });
});
