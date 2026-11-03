export type AddressedRecipients = Readonly<{
  toIds: ReadonlyArray<URL>;
  ccIds: ReadonlyArray<URL>;
  btoIds: ReadonlyArray<URL>;
  bccIds: ReadonlyArray<URL>;
  audienceIds: ReadonlyArray<URL>;
}>;

const localActorPath = /^\/users\/[^/]+$/;

export const extractRecipientActorUris = (
  addressed: ReadonlyArray<AddressedRecipients>,
  origin: string,
): string[] => {
  const localOrigin = new URL(origin).origin;
  const uris = addressed
    .flatMap((a) => [...a.toIds, ...a.ccIds, ...a.btoIds, ...a.bccIds, ...a.audienceIds])
    .filter((id) => id.origin === localOrigin && localActorPath.test(id.pathname))
    .map((id) => `${id.origin}${id.pathname}`);
  return [...new Set(uris)];
};
