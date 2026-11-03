export const idsJson = (ids: ReadonlyArray<string>): string => {
  const json = JSON.stringify(ids);
  if (new TextEncoder().encode(json).byteLength > 2_000_000) {
    throw new Error('D1 id selection exceeds the text value limit.');
  }
  return json;
};
