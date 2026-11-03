import type { IoriStatusExtension } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';

type LinkPreview = IoriStatusExtension['link_previews'][number];

type Props = Readonly<{
  preview: LinkPreview;
}>;

export const LinkPreviewCard = ({ preview }: Props) => {
  const previewUrl = safeUrl(preview.url);
  if (!previewUrl) return null;
  const imageUrl = safeUrl(preview.image);
  const faviconUrl = safeUrl(preview.favicon);

  const displayUrl = (() => {
    try {
      const url = new URL(previewUrl);
      return url.hostname;
    } catch {
      return previewUrl;
    }
  })();

  return (
    <a
      href={previewUrl}
      target='_blank'
      rel='noopener noreferrer'
      class='block rounded-xl border border-warm-gray dark:border-gray-700 overflow-hidden hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors'
    >
      <div class='flex'>
        {imageUrl && (
          <div class='flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32'>
            <img
              src={imageUrl}
              alt={preview.title ?? 'Link preview'}
              class='w-full h-full object-cover'
              loading='lazy'
            />
          </div>
        )}
        <div class='flex-1 min-w-0 p-3'>
          <div class='flex items-center gap-1 text-xs text-charcoal-light dark:text-gray-400 mb-1'>
            {faviconUrl && (
              <img
                src={faviconUrl}
                alt=''
                class='w-4 h-4 flex-shrink-0'
                loading='lazy'
              />
            )}
            <span class='truncate'>{preview.site_name ?? displayUrl}</span>
          </div>
          {preview.title && (
            <h4 class='text-sm font-medium text-charcoal dark:text-white line-clamp-2 mb-1'>
              {preview.title}
            </h4>
          )}
          {preview.description && (
            <p class='text-xs text-charcoal-light dark:text-gray-400 line-clamp-2'>
              {preview.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
};
