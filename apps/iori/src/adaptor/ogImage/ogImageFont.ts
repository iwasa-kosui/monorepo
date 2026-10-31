const readFontResponse = async (response: Response, limit: number): Promise<ArrayBuffer> => {
  if (!response.ok || !response.body) throw new Error('Font download failed.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) throw new Error('Font response exceeds bound.');
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  if (!size) throw new Error('Empty font response.');
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
};
export const fetchOgFont = async (
  { fetchRequest = fetch, signal, text }: { fetchRequest?: typeof fetch; signal?: AbortSignal; text?: string } = {},
): Promise<ArrayBuffer> => {
  const deadline = (ms: number) =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700${
    text === undefined ? '' : `&text=${encodeURIComponent(text)}`
  }`;
  const css = new TextDecoder().decode(
    await readFontResponse(
      await fetchRequest(cssUrl, {
        headers: { 'User-Agent': 'Safari/534.30' },
        redirect: 'error',
        signal: deadline(15_000),
      }),
      64 * 1024,
    ),
  );
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:ttf|otf)[^)]*)\)/)
    || css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!match?.[1]) throw new Error('Trusted font URL is missing.');
  const url = new URL(match[1]);
  if (
    url.protocol !== 'https:' || url.hostname !== 'fonts.gstatic.com' || url.port || url.username || url.password
    || url.hash
  ) throw new Error('Invalid font URL.');
  return readFontResponse(await fetchRequest(url, { redirect: 'error', signal: deadline(30_000) }), 16 * 1024 * 1024);
};
