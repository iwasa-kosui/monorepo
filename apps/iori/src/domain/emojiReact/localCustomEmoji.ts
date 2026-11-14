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
const BLOBCAT_NAMES: readonly string[] = [
  'blobcat',
  'blobcatthumbsup',
  'blobcatheart',
  'blobcathearteyes',
  'blobcatthink',
  'blobcatlaughing',
  'blobcatparty',
  'blobcatyipee',
  'blobcatbigsob',
  'blobcatmelt',
  'blobcatmelttears',
  'blobcatblushplead',
  'blobcatpats',
  'blobcathug',
  'blobcatpeek',
  'blobcateyes',
  'blobcatpray',
  'blobcatsalute',
  'blobcatsleep',
  'blobcatwave',
];

export const LOCAL_CUSTOM_EMOJIS: readonly LocalCustomEmoji[] = BLOBCAT_NAMES.map((name) => ({
  shortcode: `:${name}:`,
  path: `/emoji/${name}.png`,
  mediaType: 'image/png',
}));

export const findLocalCustomEmoji = (emoji: string): LocalCustomEmoji | undefined =>
  LOCAL_CUSTOM_EMOJIS.find((custom) => custom.shortcode === emoji);
