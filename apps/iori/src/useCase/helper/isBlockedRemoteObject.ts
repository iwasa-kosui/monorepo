export const isBlockedRemoteObject = (
  object: { readonly id: URL | null; readonly attributionIds: readonly URL[] },
  isBlockedUri: (uri: string) => boolean,
): boolean =>
  (object.id !== null && isBlockedUri(object.id.href))
  || object.attributionIds.some((id) => isBlockedUri(id.href));
