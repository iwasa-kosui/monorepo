import ogs from 'open-graph-scraper';
import type { OgpData } from './presentations';

export async function fetchOgp(url: string): Promise<OgpData | null> {
  try {
    const { result, error } = await ogs({ url, timeout: 10000 });
    if (error || !result.success) return null;

    return {
      title: result.ogTitle || result.dcTitle || '',
      description: result.ogDescription || result.dcDescription || '',
      imageUrl: result.ogImage?.[0]?.url || null,
      url,
    };
  } catch {
    return null;
  }
}
