const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal'];

// DNS で内部アドレスに解決される名前は検査しない（Workers の fetch はプライベートなアドレスに届かないため）
export const blockedReason = (url: URL): string | undefined => {
  if (url.protocol !== 'https:') return 'only https is allowed';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[')) return 'IP address hosts are not allowed';
  if (IPV4_LITERAL.test(host)) return 'IP address hosts are not allowed';
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return 'local hosts are not allowed';
  }
  return undefined;
};
