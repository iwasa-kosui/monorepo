import type { MentionRecipient } from '../../domain/post/mention.ts';
import type { PostQuote, PostQuotesResolverByPostIds } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { MentionedActor } from './mentionNote.ts';

export type QuoteNoteFields = Readonly<{
  quoteUrl: URL | undefined;
  actors: ReadonlyArray<MentionedActor>;
  recipients: ReadonlyArray<MentionRecipient>;
}>;

export const toQuoteNoteFields = (quote: PostQuote | undefined): QuoteNoteFields => {
  if (quote === undefined) {
    return { quoteUrl: undefined, actors: [], recipients: [] };
  }
  const { author } = quote;
  return {
    quoteUrl: new URL(quote.uri),
    actors: author === null ? [] : [{
      id: new URL(author.id),
      ...(author.username === null ? {} : { name: `@${author.username}@${new URL(author.id).host}` }),
    }],
    recipients: author === null ? [] : [{ id: author.id, inboxUrl: author.inboxUrl }],
  };
};

export const resolveQuoteNoteFields = async (
  resolver: PostQuotesResolverByPostIds | undefined,
  postId: PostId,
  quoteUri: string | undefined,
  visibility?: Visibility,
): Promise<QuoteNoteFields> => {
  if (quoteUri === undefined) {
    return toQuoteNoteFields(undefined);
  }
  if (visibility === 'direct') {
    return { quoteUrl: new URL(quoteUri), actors: [], recipients: [] };
  }
  const resolved = await resolver?.resolve([postId]);
  return toQuoteNoteFields({
    uri: quoteUri,
    author: (resolved?.ok ? resolved.val.get(postId)?.author : undefined) ?? null,
  });
};
