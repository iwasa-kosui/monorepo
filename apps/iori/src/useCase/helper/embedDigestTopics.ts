import {
  DigestTopic,
  type DigestTopicEmbedded,
  type DigestTopicEmbeddedStore,
} from '../../domain/digestTopic/digestTopic.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import { embedTextsOneByOneOnFailure } from './embedTexts.ts';

type Deps = Readonly<{
  textEmbedder: TextEmbedder;
  digestTopicEmbeddedStore: DigestTopicEmbeddedStore;
  now: () => Instant;
}>;

export const embedDigestTopics = async (
  { textEmbedder, digestTopicEmbeddedStore, now }: Deps,
  topics: ReadonlyArray<DigestTopic>,
): Promise<number> => {
  if (topics.length === 0) return 0;
  const vectors = await embedTextsOneByOneOnFailure(
    textEmbedder,
    topics.map(DigestTopic.toEmbeddingText),
    (index, error) => {
      console.error('iori digest topics: embedding a topic failed.', {
        topicKey: topics[index]!.topicKey,
        errorMessage: error.message,
      });
    },
  );
  if (!vectors.ok) {
    console.error('iori digest topics: embedding topics failed.', { errorMessage: vectors.err.message });
    return 0;
  }
  const timestamp = now();
  const embeddedEvents: DigestTopicEmbedded[] = [];
  topics.forEach((topic, index) => {
    const vector = vectors.val[index];
    if (vector === undefined) return;
    const event = DigestTopic.embed(topic, Float32Array.from(vector), timestamp);
    if (event.ok) embeddedEvents.push(event.val);
    else {
      console.error('iori digest topics: a topic embedding was rejected.', {
        topicKey: topic.topicKey,
        errorMessage: event.err.message,
      });
    }
  });
  if (embeddedEvents.length > 0) await digestTopicEmbeddedStore.store(...embeddedEvents);
  return embeddedEvents.length;
};

export const embedDigestTopicIfAvailable = async (
  { textEmbedder, ...deps }: Omit<Deps, 'textEmbedder'> & Readonly<{ textEmbedder: TextEmbedder | undefined }>,
  topic: DigestTopic,
): Promise<void> => {
  if (textEmbedder === undefined) {
    console.error('iori digest topics: no text embedder is available, so the topic stays unembedded.', {
      topicKey: topic.topicKey,
    });
    return;
  }
  await embedDigestTopics({ textEmbedder, ...deps }, [topic]);
};
