import satori from 'satori';
import sharp from 'sharp';

import { buildOgImageElement, createOgImageSatoriOptions } from '../ogImage/ogImageElement.ts';

export const renderNodeOgImage = async (
  { title, fontData }: { title: string; fontData: ArrayBuffer },
): Promise<Buffer> => {
  const svg = await satori(buildOgImageElement(title), createOgImageSatoriOptions(fontData));

  return sharp(Buffer.from(svg)).png().toBuffer();
};
