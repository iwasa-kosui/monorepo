import type { MediaUpload } from '../../../domain/mediaUpload/mediaUpload.ts';
import type { PostImageObjectStore } from '../../../ports/postImageObjectStore.ts';
import type { BlueskyPostImage } from '../../../useCase/helper/publishBlueskyPost.ts';
import { parseUploadFilenameImageId } from '../../r2/postImageObjectStore.ts';

export const loadBlueskyPostImage = async (
  uploads: Pick<PostImageObjectStore, 'get'>,
  media: MediaUpload,
): Promise<BlueskyPostImage | undefined> => {
  try {
    const imageId = parseUploadFilenameImageId(new URL(media.url).pathname.split('/').pop() ?? '');
    if (!imageId.ok) return undefined;
    const object = await uploads.get(imageId.val);
    if (object === undefined) return undefined;
    const bytes = new Uint8Array(await new Response(object.body as unknown as BodyInit).arrayBuffer());
    return { bytes, mimeType: object.contentType, alt: media.description ?? '' };
  } catch {
    return undefined;
  }
};
