import { Document, type DocumentLoader, Image, type Note } from '@fedify/fedify';

export type Attachment = Readonly<{
  url: string;
  altText: string | null;
}>;

export const extractAttachments = async (
  note: Note,
  documentLoader: DocumentLoader,
): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];
  for await (const attachment of note.getAttachments({ documentLoader })) {
    if (attachment instanceof Document || attachment instanceof Image) {
      const url = attachment.url;
      if (url instanceof URL) {
        attachments.push({
          url: url.href,
          altText: attachment.name?.toString() ?? null,
        });
      }
    }
  }
  return attachments;
};
