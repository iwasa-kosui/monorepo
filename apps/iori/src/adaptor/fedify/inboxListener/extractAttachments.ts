import { Document, Image } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';

import type { RemotePostAttachment } from '../../../domain/post/post.ts';
import type { RemotePostObject } from '../../../useCase/helper/remotePostObject.ts';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

export const extractAttachments = async (
  note: RemotePostObject,
  documentLoader: DocumentLoader,
): Promise<RemotePostAttachment[]> => {
  const attachments: RemotePostAttachment[] = [];
  for await (const attachment of note.getAttachments({ documentLoader })) {
    if (attachment instanceof Document || attachment instanceof Image) {
      const url = attachment.url;
      if (url instanceof URL && ALLOWED_PROTOCOLS.has(url.protocol)) {
        attachments.push({
          url: url.href,
          altText: attachment.name?.toString() ?? null,
          mediaType: attachment.mediaType ?? null,
        });
      }
    }
  }
  return attachments;
};
