export type LocalCustomEmoji = Readonly<{
  shortcode: string;
  path: string;
  mediaType: string;
}>;

/**
 * iori が自前で配信するカスタム絵文字。
 * 画像は public/emoji/ に置き、ピッカーとリアクションの送信で同じ画像を使う。
 * blobcat: https://github.com/DuckOfDisorder/BlobCats (Apache License 2.0)
 */
export const LOCAL_CUSTOM_EMOJIS: readonly LocalCustomEmoji[] = [
  { shortcode: ':blobcat:', path: '/emoji/blobcat.png', mediaType: 'image/png' },
];

export const findLocalCustomEmoji = (emoji: string): LocalCustomEmoji | undefined =>
  LOCAL_CUSTOM_EMOJIS.find((custom) => custom.shortcode === emoji);
