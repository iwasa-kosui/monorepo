export type AttachmentKind = 'image' | 'video' | 'audio';

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'flac']);

const kindFromMediaType = (mediaType: string | null | undefined): AttachmentKind | undefined => {
  if (mediaType === null || mediaType === undefined) return undefined;
  const essence = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (essence.startsWith('video/')) return 'video';
  if (essence.startsWith('audio/')) return 'audio';
  if (essence.startsWith('image/')) return 'image';
  return undefined;
};

const extensionOfUrl = (url: string): string => {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split(/[?#]/)[0] ?? '';
  }
  const lastSegment = pathname.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  return dot < 0 ? '' : lastSegment.slice(dot + 1).toLowerCase();
};

const kindFromUrl = (url: string): AttachmentKind => {
  const extension = extensionOfUrl(url);
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'image';
};

export const attachmentKindOf = (attachment: Readonly<{ url: string; mediaType?: string | null }>): AttachmentKind =>
  kindFromMediaType(attachment.mediaType) ?? kindFromUrl(attachment.url);
