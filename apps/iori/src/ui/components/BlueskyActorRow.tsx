import type { Child } from 'hono/jsx';

import type { IoriBlueskyActorBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { blueskyProfilePageHref, isExternalHref } from '../api/blueskyLinks.ts';

type Props = Readonly<{ actor: IoriBlueskyActorBody; href?: string; trailing?: Child }>;

const DESCRIPTION_MAX_LENGTH = 120;

export const actorDescriptionExcerpt = (description: string | null): string => {
  const text = (description ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...text];
  return chars.length > DESCRIPTION_MAX_LENGTH ? `${chars.slice(0, DESCRIPTION_MAX_LENGTH).join('')}…` : text;
};

export const BlueskyActorRow = ({ actor, href: hrefOverride, trailing }: Props) => {
  const avatar = safeAbsoluteUrl(actor.avatar);
  const href = hrefOverride ?? blueskyProfilePageHref(actor.did);
  const excerpt = actorDescriptionExcerpt(actor.description);
  const external = isExternalHref(href);
  const hasTrailing = trailing !== undefined;
  const content = (
    <>
      <span class='w-10 h-10 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-clay-sm overflow-hidden'>
        {avatar === undefined
          ? actor.handle.charAt(0).toUpperCase()
          : <img src={avatar} alt='' class='w-10 h-10 blob-avatar object-cover' loading='lazy' />}
      </span>
      <span class='min-w-0 flex-1'>
        <span class='flex flex-wrap items-baseline gap-x-2'>
          <span class='font-semibold text-charcoal dark:text-white truncate'>{actor.displayName ?? actor.handle}</span>
          <span class='text-sm text-charcoal-light dark:text-gray-400 truncate'>@{actor.handle}</span>
          {!hasTrailing && actor.followedByMe && (
            <span class='text-xs rounded-full bg-sage/20 text-sage-dark dark:text-sage px-2 py-0.5'>フォロー中</span>
          )}
        </span>
        {excerpt !== '' && (
          <span class='block mt-1 text-sm text-charcoal dark:text-gray-100 break-words'>{excerpt}</span>
        )}
      </span>
    </>
  );
  const linkAttributes = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  if (!hasTrailing) {
    return (
      <a
        href={href}
        {...linkAttributes}
        class='flex items-start gap-3 bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
      >
        {content}
      </a>
    );
  }
  return (
    <div class='flex items-start gap-3 bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4'>
      <a
        href={href}
        {...linkAttributes}
        class='flex flex-1 min-w-0 items-start gap-3 hover:opacity-80 transition-opacity'
      >
        {content}
      </a>
      <div class='flex-shrink-0'>{trailing}</div>
    </div>
  );
};
