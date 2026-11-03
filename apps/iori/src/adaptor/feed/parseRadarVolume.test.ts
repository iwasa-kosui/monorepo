import { describe, expect, it } from 'vitest';

import { parseRadarVolume } from './parseRadarVolume.ts';

const PDF_DIR = '/content/dam/thoughtworks/documents/radar';

describe('parseRadarVolume', () => {
  it('picks the largest volume when the archive list (Vol 33) and the download link (Vol 34) are mixed', () => {
    const html = `<a href="${PDF_DIR}/2025/04/tr_technology_radar_vol_32_en.pdf">Vol 32</a>`
      + `<a href="https://www.thoughtworks.com${PDF_DIR}/2025/11/tr_technology_radar_vol_33_en.pdf">Vol 33</a>`
      + `<a class="download" href="${PDF_DIR}/2026/04/tr_technology_radar_vol_34_en.pdf">Download</a>`;
    expect(parseRadarVolume(html)).toEqual({
      ok: true,
      val: {
        volume: 34,
        year: 2026,
        month: 4,
        pdfUrl: `https://www.thoughtworks.com${PDF_DIR}/2026/04/tr_technology_radar_vol_34_en.pdf`,
      },
    });
  });

  it('accepts a digit suffix after _en', () => {
    const result = parseRadarVolume(`<a href="${PDF_DIR}/2024/04/tr_technology_radar_vol_30_en1.pdf">x</a>`);
    expect(result).toMatchObject({
      ok: true,
      val: { volume: 30, pdfUrl: `https://www.thoughtworks.com${PDF_DIR}/2024/04/tr_technology_radar_vol_30_en1.pdf` },
    });
  });

  it('turns a relative path into an absolute URL', () => {
    const result = parseRadarVolume(`href='${PDF_DIR}/2023/10/tr_technology_radar_vol_29_en.pdf'`);
    expect(result).toMatchObject({
      ok: true,
      val: { volume: 29, year: 2023, month: 10, pdfUrl: expect.stringMatching(/^https:\/\/www\.thoughtworks\.com\//) },
    });
  });

  it('compares volumes as numbers, not strings', () => {
    const html =
      `${PDF_DIR}/2020/01/tr_technology_radar_vol_9_en.pdf ${PDF_DIR}/2020/10/tr_technology_radar_vol_10_en.pdf`;
    expect(parseRadarVolume(html)).toMatchObject({ ok: true, val: { volume: 10 } });
  });

  it('ignores PDFs in other languages', () => {
    const html = `<a href="${PDF_DIR}/2026/04/tr_technology_radar_vol_34_ja.pdf">ja</a>`;
    expect(parseRadarVolume(html).ok).toBe(false);
  });

  it('does not pick up a PDF whose volume has five or more digits', () => {
    const html = `<a href="${PDF_DIR}/2026/04/tr_technology_radar_vol_12345_en.pdf">x</a>`
      + `<a href="${PDF_DIR}/2025/11/tr_technology_radar_vol_33_en.pdf">Vol 33</a>`;
    expect(parseRadarVolume(html)).toMatchObject({ ok: true, val: { volume: 33 } });
    expect(parseRadarVolume(`<a href="${PDF_DIR}/2026/04/tr_technology_radar_vol_12345_en.pdf">x</a>`).ok).toBe(false);
  });

  it('fails with a reason about the page structure when no link is found', () => {
    const result = parseRadarVolume('<html><body>nothing here</body></html>');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.message).toContain('page structure may have changed');
  });
});
