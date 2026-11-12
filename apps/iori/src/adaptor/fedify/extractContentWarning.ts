import { Article } from '@fedify/vocab';

import type { RemotePostObject } from '../../useCase/helper/remotePostObject.ts';

export type ContentWarning = Readonly<{
  summary: string | null;
  sensitive: boolean;
}>;

export const extractContentWarning = (post: RemotePostObject): ContentWarning => {
  const summary = post instanceof Article || post.summary === null ? '' : String(post.summary);
  return {
    summary: summary === '' ? null : summary,
    sensitive: post.sensitive ?? false,
  };
};
