import type { MediaUpload } from '../../domain/mediaUpload/mediaUpload.ts';
import type { MediaAttachment } from './entities.ts';

export const toMediaAttachment = (media: MediaUpload): MediaAttachment => ({
  id: media.mediaId,
  type: 'image',
  url: media.url,
  preview_url: media.url,
  remote_url: null,
  meta: null,
  description: media.description,
  blurhash: null,
});
