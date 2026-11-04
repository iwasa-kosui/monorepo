import { RA } from '@iwasa-kosui/result';

import type { AiError } from '../../ports/aiError.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';

export const INTEREST_EMBEDDING_MODEL = '@cf/baai/bge-m3';

const embedTexts = async (
  textEmbedder: TextEmbedder,
  texts: ReadonlyArray<string>,
): RA<ReadonlyArray<ReadonlyArray<number>>, AiError> => {
  const embedded = await textEmbedder.embed({ model: INTEREST_EMBEDDING_MODEL, texts });
  if (!embedded.ok) return embedded;
  if (embedded.val.length !== texts.length) {
    return RA.err({
      type: 'AiError',
      message: `The embedder returned ${embedded.val.length} embeddings for ${texts.length} texts.`,
    });
  }
  return embedded;
};

export const embedTextsOneByOneOnFailure = async (
  textEmbedder: TextEmbedder,
  texts: ReadonlyArray<string>,
  onSingleFailure: (index: number, error: AiError) => void,
): RA<ReadonlyArray<ReadonlyArray<number> | undefined>, AiError> => {
  if (texts.length === 0) return RA.ok([]);
  const batch = await embedTexts(textEmbedder, texts);
  if (batch.ok) return batch;
  let lastError = batch.err;
  const vectors: Array<ReadonlyArray<number> | undefined> = [];
  for (const [index, text] of texts.entries()) {
    const single = await embedTexts(textEmbedder, [text]);
    if (single.ok) vectors.push(single.val[0]);
    else {
      lastError = single.err;
      vectors.push(undefined);
      onSingleFailure(index, single.err);
    }
  }
  if (vectors.every((vector) => vector === undefined)) return RA.err(lastError);
  return RA.ok(vectors);
};
