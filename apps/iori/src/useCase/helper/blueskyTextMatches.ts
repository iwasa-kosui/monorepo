type Span = Readonly<{ start: number; end: number }>;

const urlPattern = /https?:\/\/[\x21-\x7E]+/g;
// 公式アプリの検出に合わせ、@ の直前が先頭・空白・( のときだけ mention にする
const mentionPattern =
  /(?<=^|\s|\()@((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)/g;
const trailingPunctuation = /[.,;:!?'"\]}>]$/;

const trimUrl = (url: string): string => {
  let trimmed = url;
  for (;;) {
    if (trailingPunctuation.test(trimmed)) trimmed = trimmed.slice(0, -1);
    else if (trimmed.endsWith(')') && trimmed.split(')').length > trimmed.split('(').length) {
      trimmed = trimmed.slice(0, -1);
    } else return trimmed;
  }
};

export const findUrls = (text: string): Array<Span & Readonly<{ uri: string }>> =>
  Array.from(text.matchAll(urlPattern), (match) => {
    const uri = trimUrl(match[0]);
    return { start: match.index, end: match.index + uri.length, uri };
  }).filter(({ uri }) => URL.canParse(uri));

export const findMentions = (text: string, urls: readonly Span[]): Array<Span & Readonly<{ handle: string }>> =>
  Array.from(text.matchAll(mentionPattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    handle: match[1]!.toLowerCase(),
  })).filter((mention) => !urls.some((url) => mention.start < url.end && url.start < mention.end));
