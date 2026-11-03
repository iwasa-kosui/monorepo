import { Result } from '@iwasa-kosui/result';

export const THOUGHTWORKS_ORIGIN = 'https://www.thoughtworks.com';

export type RadarVolume = Readonly<{
  volume: number;
  year: number;
  month: number;
  pdfUrl: string;
}>;

export type RadarParseError = Readonly<{ type: 'RadarParseError'; message: string }>;

const radarParseError = (message: string): RadarParseError => ({ type: 'RadarParseError', message });

const PDF_PATH =
  /\/content\/dam\/thoughtworks\/documents\/radar\/(\d{4})\/(\d{2})\/tr_technology_radar_vol_(\d{1,4})_en\d*\.pdf/g;

export const parseRadarVolume = (html: string): Result<RadarVolume, RadarParseError> => {
  let latest: RadarVolume | undefined;
  for (const match of html.matchAll(PDF_PATH)) {
    const [path, year, month, volume] = match as unknown as [string, string, string, string];
    const candidate: RadarVolume = {
      volume: Number(volume),
      year: Number(year),
      month: Number(month),
      pdfUrl: `${THOUGHTWORKS_ORIGIN}${path}`,
    };
    if (candidate.month < 1 || candidate.month > 12) continue;
    if (latest === undefined || candidate.volume > latest.volume) latest = candidate;
  }
  return latest === undefined
    ? Result.err(radarParseError('No Technology Radar PDF link found; the page structure may have changed'))
    : Result.ok(latest);
};
