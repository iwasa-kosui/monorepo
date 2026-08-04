import { type DocumentLoader, getDocumentLoader } from '@fedify/fedify';

const PRELOADED_CONTEXTS: Record<string, object> = {
  'http://joinmastodon.org/ns': {
    '@context': {
      'toot': 'http://joinmastodon.org/ns#',
      'Emoji': 'toot:Emoji',
      'featured': { '@id': 'toot:featured', '@type': '@id' },
      'featuredTags': { '@id': 'toot:featuredTags', '@type': '@id' },
      'discoverable': 'toot:discoverable',
      'suspended': 'toot:suspended',
      'memorial': 'toot:memorial',
      'indexable': 'toot:indexable',
      'focalPoint': { '@id': 'toot:focalPoint', '@container': '@list' },
      'blurhash': 'toot:blurhash',
      'votersCount': 'toot:votersCount',
    },
  },
  'https://joinmastodon.org/ns': {
    '@context': {
      'toot': 'http://joinmastodon.org/ns#',
      'Emoji': 'toot:Emoji',
      'featured': { '@id': 'toot:featured', '@type': '@id' },
      'featuredTags': { '@id': 'toot:featuredTags', '@type': '@id' },
      'discoverable': 'toot:discoverable',
      'suspended': 'toot:suspended',
      'memorial': 'toot:memorial',
      'indexable': 'toot:indexable',
      'focalPoint': { '@id': 'toot:focalPoint', '@container': '@list' },
      'blurhash': 'toot:blurhash',
      'votersCount': 'toot:votersCount',
    },
  },
  'http://litepub.social/ns': {
    '@context': {
      'litepub': 'http://litepub.social/ns#',
      'EmojiReact': 'litepub:EmojiReact',
    },
  },
};

export const createContextLoaderFactory = () => {
  return (): DocumentLoader => {
    const baseLoader = getDocumentLoader();
    return async (url, options) => {
      const preloadedContext = PRELOADED_CONTEXTS[url];
      if (preloadedContext) {
        return {
          contextUrl: null,
          document: preloadedContext,
          documentUrl: url,
        };
      }
      return baseLoader(url, options);
    };
  };
};
