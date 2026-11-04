const META_SCAN_BYTES = 1024;
const HTML_MEDIA_TYPES = ['text/html', 'application/xhtml+xml'];

const createDecoder = (label: string): TextDecoder | undefined => {
  try {
    return new TextDecoder(label.trim());
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
};

const decodeStrictUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
};

const bomEncoding = (bytes: Uint8Array): string | undefined => {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
  return undefined;
};

const parseContentType = (contentType: string | null | undefined): { mediaType: string; charset?: string } => {
  const [media = '', ...params] = (contentType ?? '').split(';');
  for (const param of params) {
    const separator = param.indexOf('=');
    if (separator < 0) continue;
    if (param.slice(0, separator).trim().toLowerCase() !== 'charset') continue;
    const value = param.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2').trim();
    if (value !== '') return { mediaType: media.trim().toLowerCase(), charset: value };
  }
  return { mediaType: media.trim().toLowerCase() };
};

const META_TAG = /<meta(?=[\s/])[^>]*>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/g;
const CHARSET_IN_CONTENT = /charset\s*=\s*["']?\s*([^\s"';]+)/i;

const sniffMetaCharset = (bytes: Uint8Array): string | undefined => {
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, META_SCAN_BYTES));
  for (const [tag] of head.matchAll(META_TAG)) {
    const attributes = new Map<string, string>();
    for (const [, name = '', quoted, singleQuoted, bare] of tag.slice('<meta'.length).matchAll(ATTRIBUTE)) {
      const key = name.toLowerCase();
      if (!attributes.has(key)) attributes.set(key, quoted ?? singleQuoted ?? bare ?? '');
    }
    const charset = attributes.get('charset')?.trim();
    if (charset) return charset;
    if (attributes.get('http-equiv')?.trim().toLowerCase() === 'content-type') {
      const fromContent = attributes.get('content')?.match(CHARSET_IN_CONTENT)?.[1];
      if (fromContent) return fromContent;
    }
  }
  return undefined;
};

export const decodeBody = (bytes: Uint8Array, contentType: string | null | undefined): string => {
  const bom = bomEncoding(bytes);
  if (bom !== undefined) return new TextDecoder(bom).decode(bytes);

  const { mediaType, charset } = parseContentType(contentType);
  const headerDecoder = charset === undefined ? undefined : createDecoder(charset);
  if (headerDecoder !== undefined) {
    if (headerDecoder.encoding !== 'windows-1252') return headerDecoder.decode(bytes);
    return decodeStrictUtf8(bytes) ?? headerDecoder.decode(bytes);
  }

  if (mediaType === '' || HTML_MEDIA_TYPES.includes(mediaType)) {
    const label = sniffMetaCharset(bytes);
    const metaDecoder = label === undefined ? undefined : createDecoder(label);
    if (metaDecoder !== undefined) {
      if (metaDecoder.encoding.startsWith('utf-16')) return new TextDecoder('utf-8').decode(bytes);
      if (metaDecoder.encoding === 'x-user-defined') return new TextDecoder('windows-1252').decode(bytes);
      return metaDecoder.decode(bytes);
    }
  }

  return new TextDecoder('utf-8').decode(bytes);
};
