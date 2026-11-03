import type { PostWithAuthor } from '../../domain/post/post.ts';

export const appendUniquePosts = (
  existing: readonly PostWithAuthor[],
  incoming: readonly PostWithAuthor[],
): readonly PostWithAuthor[] => {
  const seen = new Set(existing.map((post) => post.postId));
  const added: PostWithAuthor[] = [];
  for (const post of incoming) {
    if (seen.has(post.postId)) continue;
    seen.add(post.postId);
    added.push(post);
  }
  return [...existing, ...added];
};
