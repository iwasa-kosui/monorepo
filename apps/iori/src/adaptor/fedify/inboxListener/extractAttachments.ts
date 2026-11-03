import { Document, type DocumentLoader, Image, type Note } from '@fedify/fedify';

import type { RemotePostAttachment } from '../../../domain/post/post.ts';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

export const extractAttachments = async (
  note: Note,
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
        });
      }
    }
  }
  return attachments;
};
