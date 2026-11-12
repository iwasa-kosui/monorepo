export const BLOCKED_INBOX_DOMAINS: readonly string[] = ['crazylab.online', 'baraag.net'];

// Content-Length がない本文と文字数での比較は目安で、正確なバイト数の上限ではない
const APPROX_MAX_INBOX_BODY_SIZE = 16 * 1024 * 1024;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const idsOf = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(idsOf);
  if (isRecord(value) && typeof value['id'] === 'string') return [value['id']];
  return [];
};

const candidateIds = (activity: Json): string[] => {
  const object = activity['object'];
  const signature = activity['signature'];
  return [
    ...idsOf(activity['actor']),
    ...idsOf(object),
    ...(isRecord(object) ? idsOf(object['attributedTo']) : []),
    ...(isRecord(signature) ? idsOf(signature['creator']) : []),
  ];
};

const hostnameOf = (id: string): string | undefined => {
  try {
    return new URL(id).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return undefined;
  }
};

export const isBlockedHost = (hostname: string, domain: string): boolean => {
  const host = hostname.toLowerCase();
  const blocked = domain.toLowerCase();
  return host === blocked || host.endsWith(`.${blocked}`);
};

export const isBlockedUri = (uri: string, domains: readonly string[] = BLOCKED_INBOX_DOMAINS): boolean => {
  const hostname = hostnameOf(uri);
  return hostname !== undefined && domains.some((d) => isBlockedHost(hostname, d));
};

export const findBlockedInboxDomain = (
  activity: unknown,
  domains: readonly string[] = BLOCKED_INBOX_DOMAINS,
): string | undefined => {
  if (!isRecord(activity)) return undefined;
  for (const id of candidateIds(activity)) {
    const hostname = hostnameOf(id);
    if (hostname === undefined) continue;
    const domain = domains.find((d) => isBlockedHost(hostname, d));
    if (domain !== undefined) return domain;
  }
  return undefined;
};

export const readInboxActivity = async (request: Request): Promise<unknown> => {
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > APPROX_MAX_INBOX_BODY_SIZE) return undefined;
  try {
    const text = await request.clone().text();
    if (text.length > APPROX_MAX_INBOX_BODY_SIZE) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const ACTIVITY_TYPE_LOG_LIMIT = 64;

export const activityTypeOf = (activity: unknown): string =>
  isRecord(activity) && typeof activity['type'] === 'string'
    ? activity['type'].slice(0, ACTIVITY_TYPE_LOG_LIMIT)
    : 'unknown';
