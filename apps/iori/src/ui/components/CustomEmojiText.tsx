import type { CustomEmoji } from '../../adaptor/mastodon/entities.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';

type Segment = Readonly<{ type: 'text'; text: string }> | Readonly<{ type: 'emoji'; shortcode: string; url: string }>;

const SHORTCODE_PATTERN = /:([a-zA-Z0-9_]+):/g;

export const splitCustomEmojiText = (text: string, emojis: readonly CustomEmoji[]): readonly Segment[] => {
  const urls = new Map<string, string>();
  for (const emoji of emojis) {
    const url = safeAbsoluteUrl(emoji.url);
    if (url !== undefined) urls.set(emoji.shortcode, url);
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SHORTCODE_PATTERN)) {
    const shortcode = match[1];
    const url = urls.get(shortcode);
    if (url === undefined) continue;
    if (match.index > cursor) segments.push({ type: 'text', text: text.slice(cursor, match.index) });
    segments.push({ type: 'emoji', shortcode, url });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
};

type Props = Readonly<{
  text: string;
  emojis: readonly CustomEmoji[];
}>;

export const CustomEmojiText = ({ text, emojis }: Props) => (
  <>
    {splitCustomEmojiText(text, emojis).map((segment) =>
      segment.type === 'text'
        ? segment.text
        : (
          <img
            src={segment.url}
            alt={`:${segment.shortcode}:`}
            title={`:${segment.shortcode}:`}
            class='inline-block h-[1.2em] w-[1.2em] align-text-bottom object-contain'
          />
        )
    )}
  </>
);
