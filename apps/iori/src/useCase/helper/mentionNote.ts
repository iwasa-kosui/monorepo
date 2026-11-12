import { Mention } from '@fedify/vocab';

import { mentionLinksOfHtml } from '../../domain/post/mention.ts';

export type MentionedActor = Readonly<{ id: URL; name?: string }>;

export const toMentionNoteFields = (
  html: string,
  extraActors: ReadonlyArray<MentionedActor> = [],
): Readonly<{ tags: Mention[]; ccs: URL[] }> => {
  const mentioned = new Map<string, MentionedActor>();
  for (const { href, name } of mentionLinksOfHtml(html)) {
    const id = new URL(href);
    mentioned.set(id.href, { id, name });
  }
  for (const actor of extraActors) {
    if (!mentioned.has(actor.id.href)) {
      mentioned.set(actor.id.href, actor);
    }
  }
  const actors = [...mentioned.values()];
  return {
    tags: actors.map(({ id, name }) => new Mention({ href: id, ...(name === undefined ? {} : { name }) })),
    ccs: actors.map(({ id }) => id),
  };
};
