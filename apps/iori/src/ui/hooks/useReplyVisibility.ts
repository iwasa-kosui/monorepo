import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { Visibility } from '../../domain/post/visibility.ts';
import { DEFAULT_POST_VISIBILITY, type PostVisibility, replyVisibilityDefault } from '../components/postVisibility.ts';
import { useDefaultPostVisibility } from './useDefaultPostVisibility.ts';

export type UseReplyVisibilityReturn = Readonly<{
  visibility: PostVisibility;
  parentVisibility: Visibility | undefined;
  setVisibility: (visibility: PostVisibility) => void;
  resetFor: (parent?: Visibility) => void;
  clear: () => void;
}>;

export const useReplyVisibility = (): UseReplyVisibilityReturn => {
  const [visibility, setVisibilityState] = useState<PostVisibility>(DEFAULT_POST_VISIBILITY);
  const [parentVisibility, setParentVisibility] = useState<Visibility | undefined>(undefined);
  const { defaultVisibility } = useDefaultPostVisibility();
  const touched = useRef(false);
  const defaultRef = useRef<PostVisibility>(defaultVisibility);
  defaultRef.current = defaultVisibility;

  useEffect(() => {
    if (touched.current) return;
    setVisibilityState(replyVisibilityDefault(parentVisibility, defaultVisibility));
  }, [defaultVisibility]);

  const setVisibility = useCallback((next: PostVisibility) => {
    touched.current = true;
    setVisibilityState(next);
  }, []);

  const resetFor = useCallback((parent?: Visibility) => {
    touched.current = false;
    setParentVisibility(parent);
    setVisibilityState(replyVisibilityDefault(parent, defaultRef.current ?? DEFAULT_POST_VISIBILITY));
  }, []);

  const clear = useCallback(() => {
    touched.current = false;
    setParentVisibility(undefined);
    setVisibilityState(DEFAULT_POST_VISIBILITY);
  }, []);

  return { visibility, parentVisibility, setVisibility, resetFor, clear } as const;
};
