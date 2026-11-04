import { Document } from '@fedify/vocab';

import { getMimeTypeFromUrl } from '../../domain/image/mimeType.ts';
import type { PostImageSource } from './postImages.ts';

export const toImageDocument = (image: PostImageSource, origin: string): Document =>
  new Document({
    url: new URL(image.url, origin),
    mediaType: getMimeTypeFromUrl(image.url),
    ...(image.altText === null || image.altText === '' ? {} : { name: image.altText }),
  });
