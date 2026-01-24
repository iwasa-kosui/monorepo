import type { LinkPreview } from '../../domain/linkPreview/linkPreview.ts';

type Props = Readonly<{
  preview: LinkPreview;
}>;

export const LinkPreviewCard = ({ preview }: Props) => {
  const displayUrl = (() => {
    try {
      const url = new URL(preview.url);
      return url.hostname;
    } catch {
      return preview.url;
    }
  })();

  return (
    <a
      href={preview.url}
      target='_blank'
      rel='noopener noreferrer'
      class='block rounded-xl border border-warm-gray dark:border-gray-700 overflow-hidden hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors'
    >
      <div class='flex'>
        {preview.imageUrl && (
          <div class='flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32'>
            <img
              src={preview.imageUrl}
              alt={preview.title ?? 'Link preview'}
              class='w-full h-full object-cover'
              loading='lazy'
            />
          </div>
        )}
        <div class='flex-1 min-w-0 p-3'>
          <div class='flex items-center gap-1 text-xs text-charcoal-light dark:text-gray-400 mb-1'>
            {preview.faviconUrl && (
              <img
                src={preview.faviconUrl}
                alt=''
                class='w-4 h-4 flex-shrink-0'
                loading='lazy'
                onError={(e: Event) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span class='truncate'>{preview.siteName ?? displayUrl}</span>
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
