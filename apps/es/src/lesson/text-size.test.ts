import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEXT_SIZE,
  isTextSize,
  parseTextSize,
  TEXT_SIZE_KEY,
  TEXT_SIZE_LABELS,
  TEXT_SIZES,
  textSizeAttribute,
} from './text-size';

describe('TEXT_SIZES', () => {
  it('小、標準、大の順に3段階を持つ', () => {
    expect(TEXT_SIZES).toEqual(['small', 'standard', 'large']);
  });

  it('どの段階にも画面の文言がある', () => {
    expect(TEXT_SIZES.map((size) => TEXT_SIZE_LABELS[size])).toEqual(['小', '標準', '大']);
  });

  it('既定は標準で、保存キーは es:text-size', () => {
    expect(DEFAULT_TEXT_SIZE).toBe('standard');
    expect(TEXT_SIZE_KEY).toBe('es:text-size');
  });
});

describe('isTextSize', () => {
  it('3段階の値だけを受け入れる', () => {
    expect(isTextSize('small')).toBe(true);
    expect(isTextSize('standard')).toBe(true);
    expect(isTextSize('large')).toBe(true);
    expect(isTextSize('huge')).toBe(false);
    expect(isTextSize('')).toBe(false);
    expect(isTextSize(null)).toBe(false);
    expect(isTextSize(undefined)).toBe(false);
  });
});

describe('parseTextSize', () => {
  it('保存された有効な値はそのまま返す', () => {
    expect(parseTextSize('small')).toBe('small');
    expect(parseTextSize('standard')).toBe('standard');
    expect(parseTextSize('large')).toBe('large');
  });

  it('未保存や不正な値は標準にする', () => {
    expect(parseTextSize(null)).toBe('standard');
    expect(parseTextSize(undefined)).toBe('standard');
    expect(parseTextSize('')).toBe('standard');
    expect(parseTextSize('Large')).toBe('standard');
    expect(parseTextSize('{"size":"large"}')).toBe('standard');
  });
});

describe('textSizeAttribute', () => {
  it('標準のときは属性を付けない', () => {
    expect(textSizeAttribute('standard')).toBeNull();
  });

  it('小と大のときは段階の値を属性の値にする', () => {
    expect(textSizeAttribute('small')).toBe('small');
    expect(textSizeAttribute('large')).toBe('large');
  });
});
