import { fetchOgFont } from '../ogImage/ogImageFont.ts';

export const loadNodeOgFont = async (
  { fetchRequest, signal }: { fetchRequest?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ArrayBuffer> => fetchOgFont({ fetchRequest, signal });
