export function originVapidPublicKeyMatches(input: {
  origin: string;
  publicKey: string | undefined;
  signal?: AbortSignal;
  fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
}): Promise<boolean>;
export function vapidKeyPairMatches(input: {
  privateKey: string | undefined;
  publicKey: string | undefined;
}): boolean;
