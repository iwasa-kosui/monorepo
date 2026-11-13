import { useCallback, useRef, useState } from 'hono/jsx';

import { uploadMedia } from '../api/mastodonClient.ts';
import { downscaleImageForUpload } from '../components/imageDownscale.ts';
import { mediaOverflowNotice, mediaSlotsLeft, type UploadedMedia } from '../components/postSubmission.ts';

export type UseMediaAttachmentsReturn = Readonly<{
  uploaded: readonly UploadedMedia[];
  isUploading: boolean;
  hasImages: boolean;
  slotsLeft: number;
  notice: string | null;
  select: (e: Event) => Promise<void>;
  remove: (index: number) => void;
  setDescription: (index: number, description: string) => void;
  markDescriptionSaved: (mediaId: string, savedDescription: string) => void;
  clear: () => void;
}>;

export const useMediaAttachments = (max: number = Number.POSITIVE_INFINITY): UseMediaAttachmentsReturn => {
  const [uploaded, setUploaded] = useState<UploadedMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Drops uploads that finish after clear()
  const generation = useRef(0);
  const slotsLeft = mediaSlotsLeft(uploaded.length, max);

  const select = useCallback(async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    setNotice(mediaOverflowNotice(files.length, slotsLeft, max));
    const chosen = Array.from(files).slice(0, slotsLeft);
    const started = generation.current;
    setIsUploading(true);
    const newMedia: UploadedMedia[] = [];

    for (const file of chosen) {
      try {
        const media = await uploadMedia(await downscaleImageForUpload(file));
        newMedia.push({ id: media.id, url: media.url, description: '', savedDescription: '' });
      } catch (err) {
        alert('Upload failed: ' + (err as Error).message);
      }
    }

    if (started === generation.current) {
      setUploaded((prev) => [...prev, ...newMedia]);
      setIsUploading(false);
    }
    target.value = '';
  }, [slotsLeft, max]);

  const remove = useCallback((index: number) => {
    setNotice(null);
    setUploaded((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setDescription = useCallback((index: number, description: string) => {
    setUploaded((prev) => prev.map((media, i) => (i === index ? { ...media, description } : media)));
  }, []);

  const markDescriptionSaved = useCallback((mediaId: string, savedDescription: string) => {
    setUploaded((prev) => prev.map((media) => (media.id === mediaId ? { ...media, savedDescription } : media)));
  }, []);

  const clear = useCallback(() => {
    generation.current = (generation.current ?? 0) + 1;
    setUploaded([]);
    setNotice(null);
    setIsUploading(false);
  }, []);

  return {
    uploaded,
    isUploading,
    hasImages: uploaded.length > 0,
    slotsLeft,
    notice,
    select,
    remove,
    setDescription,
    markDescriptionSaved,
    clear,
  } as const;
};
