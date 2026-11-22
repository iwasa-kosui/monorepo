import { Note } from '@fedify/vocab';

import { trailingLinkOf } from '../../domain/post/trailingLink.ts';
import { isRemotePostObject, type RemotePostObject } from '../../useCase/helper/remotePostObject.ts';

const LOOKUP_TIMEOUT_MS = 5000;

type Options = Readonly<{
  isLocalPostUri: (uri: string) => boolean;
  lookupObject: (uri: string, options: { signal: AbortSignal }) => Promise<unknown>;
}>;

const urlsOf = (note: RemotePostObject): readonly string[] => [
  ...(note.id ? [note.id.href] : []),
  ...note.urls.flatMap((url) => {
    const target = url instanceof URL ? url : url.href;
    return target ? [target.href] : [];
  }),
];

/**
 * 引用のプロパティを持たない Note が本文の最後で他の投稿へリンクしているとき、その投稿の URI を返す。
 * リンク先を取得して投稿だと確かめられたときだけ返す。
 */
export const resolveImplicitQuoteUri = async (
  note: RemotePostObject,
  { isLocalPostUri, lookupObject }: Options,
): Promise<string | null> => {
  if (!(note instanceof Note)) return null;
  const href = trailingLinkOf(String(note.content ?? ''));
  if (href === null) return null;
  const excluded = [...urlsOf(note), ...(note.replyTargetId ? [note.replyTargetId.href] : [])];
  if (excluded.includes(href)) return null;
  if (isLocalPostUri(href)) return href;
  try {
    const found = await lookupObject(href, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!isRemotePostObject(found) || !found.id) return null;
    const uri = found.id.href;
    if (!/^https?:$/.test(found.id.protocol) || excluded.includes(uri)) return null;
    return uri;
  } catch {
    return null;
  }
};
