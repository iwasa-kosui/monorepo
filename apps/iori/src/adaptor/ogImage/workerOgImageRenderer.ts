import { buildOgImageElement, createOgImageSatoriOptions } from './ogImageElement.ts';

export const renderWorkerOgImage = async (
  { title, fontData }: { title: string; fontData: ArrayBuffer },
): Promise<Uint8Array> => {
  const [{ satori }, { Resvg }] = await Promise.all([import('@cf-wasm/satori'), import('@cf-wasm/resvg')]);
  const svg = await satori(buildOgImageElement(title), createOgImageSatoriOptions(fontData));
  const resvg = await Resvg.async(svg);
  const rendered = resvg.render();
  try {
    return rendered.asPng();
  } finally {
    rendered.free();
    resvg.free();
  }
};
