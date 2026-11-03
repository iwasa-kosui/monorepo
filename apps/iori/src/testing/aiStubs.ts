import { RA } from '@iwasa-kosui/result';

import type { EmbedRequest, TextEmbedder } from '../ports/textEmbedder.ts';
import type { GenerateRequest, SummarizeRequest, TextGenerator } from '../ports/textGenerator.ts';

export const createStubTextGenerator = (
  reply: (request: SummarizeRequest | GenerateRequest) => string,
): Readonly<{ generator: TextGenerator; calls: (SummarizeRequest | GenerateRequest)[] }> => {
  const calls: (SummarizeRequest | GenerateRequest)[] = [];
  const respond = (request: SummarizeRequest | GenerateRequest) => {
    calls.push(request);
    return RA.ok(reply(request));
  };
  return { generator: { summarize: respond, generate: respond }, calls };
};

const embedText = (text: string, dimensions: number): readonly number[] => {
  const vector = Array.from({ length: dimensions }, () => 0);
  Array.from(text).forEach((char, index) => {
    vector[index % dimensions] += char.codePointAt(0) ?? 0;
  });
  return vector;
};

export const createStubEmbedder = (
  dimensions: number,
): Readonly<{ embedder: TextEmbedder; calls: EmbedRequest[] }> => {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new RangeError(`dimensions must be a positive integer: ${dimensions}`);
  }
  const calls: EmbedRequest[] = [];
  return {
    embedder: {
      embed: ({ model, texts }) => {
        calls.push({ model, texts });
        return RA.ok(texts.map((text) => embedText(text, dimensions)));
      },
    },
    calls,
  };
};
