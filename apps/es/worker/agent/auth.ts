const encoder = new TextEncoder();

const digest = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

export const bearerTokenOf = (header: string | null): string | null => {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  return match?.[1] ?? null;
};

export const matchesPassword = async (given: string | null, expected: string): Promise<boolean> => {
  const [left, right] = await Promise.all([digest(given ?? ''), digest(expected)]);
  let difference = given === null ? 1 : 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};
