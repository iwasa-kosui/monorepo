import { useEffect, useRef, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { createBlueskyPost, createStatus, updateMedia } from '../api/mastodonClient.ts';
import { useDefaultPostVisibility } from '../hooks/useDefaultPostVisibility.ts';
import { useMediaAttachments } from '../hooks/useMediaAttachments.ts';
import { blueskyCrosspostNotice } from './blueskyCrosspostMark.ts';
import { type BlueskyInteractionDraft, DEFAULT_BLUESKY_INTERACTION_DRAFT } from './blueskyInteractionDraft.ts';
import { BlueskyInteractionSettings } from './BlueskyInteractionSettings.tsx';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { MediaAttachButton, MediaPreviewList } from './MediaAttachments.tsx';
import { DEFAULT_POST_DESTINATION } from './postDestination.ts';
import { PostDestinationSelect } from './PostDestinationSelect.tsx';
import { canSubmitPost, postedNotice, type PostNotice, submitPost } from './postSubmission.ts';
import {
  type PostVisibility,
  visibilityWhenDefaultLoaded,
  visibilityWhenDestinationChanged,
} from './postVisibility.ts';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';

type Props = Readonly<{
  id?: string;
  formId?: string;
  onPosted: (status: Status) => void;
}>;

export const PostForm = ({ id, formId, onPosted }: Props) => {
  const [content, setContent] = useState('');
  const media = useMediaAttachments();
  const { uploaded, isUploading, hasImages } = media;
  const [isPosting, setIsPosting] = useState(false);
  const [destination, setDestination] = useState<PostDestination>(DEFAULT_POST_DESTINATION);
  const { defaultVisibility, isLoading: isLoadingDefault } = useDefaultPostVisibility();
  const [visibility, setVisibility] = useState<PostVisibility>(defaultVisibility);
  const visibilityTouched = useRef(false);
  const [notice, setNotice] = useState<PostNotice | undefined>(undefined);
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cw, setCw] = useState('');
  const [sensitiveChecked, setSensitiveChecked] = useState(false);
  const [blueskyInteraction, setBlueskyInteraction] = useState<BlueskyInteractionDraft>(
    DEFAULT_BLUESKY_INTERACTION_DRAFT,
  );

  const hasCw = cwEnabled && cw.trim() !== '';
  const sensitive = hasImages && (sensitiveChecked || hasCw);
  const isBlueskyOnly = destination === 'bluesky';
  const crosspostNotice = blueskyCrosspostNotice(destination, cwEnabled ? cw : '', sensitive, visibility);

  useEffect(() => {
    setVisibility((current) =>
      visibilityWhenDefaultLoaded(current, defaultVisibility, {
        touched: visibilityTouched.current === true,
        destination,
      })
    );
  }, [defaultVisibility]);

  const handleVisibilityChange = (next: PostVisibility) => {
    visibilityTouched.current = true;
    setVisibility(next);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setNotice(undefined);
  };

  const handleSubmit = async () => {
    if (isLoadingDefault || !canSubmitPost(content, isUploading, isPosting)) return;
    setIsPosting(true);
    try {
      const result = await submitPost(
        {
          content,
          uploaded,
          destination,
          visibility,
          cw: cwEnabled ? cw : '',
          sensitive: hasImages && sensitiveChecked,
          ...(isBlueskyOnly ? { blueskyInteraction } : {}),
        },
        {
          create: createStatus,
          createBlueskyPost,
          updateMedia,
          onDescriptionSaved: media.markDescriptionSaved,
          onPosted,
        },
      );
      if (result.kind === 'failed') {
        alert(result.message);
      } else {
        setContent('');
        media.clear();
        setDestination(DEFAULT_POST_DESTINATION);
        visibilityTouched.current = false;
        setVisibility(defaultVisibility);
        setCwEnabled(false);
        setCw('');
        setSensitiveChecked(false);
        setBlueskyInteraction(DEFAULT_BLUESKY_INTERACTION_DRAFT);
        setNotice(postedNotice(destination, result));
      }
    } finally {
      setIsPosting(false);
    }
  };

  const handleFormSubmit = (e: Event) => {
    e.preventDefault();
    handleSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Command+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDestinationChange = (next: PostDestination) => {
    if (next === 'bluesky') {
      setCwEnabled(false);
      setCw('');
      setSensitiveChecked(false);
    }
    setVisibility((current) =>
      visibilityWhenDestinationChanged(current, next, defaultVisibility, visibilityTouched.current === true)
    );
    setDestination(next);
  };

  const handleCwToggle = () => {
    if (cwEnabled) setCw('');
    setCwEnabled(!cwEnabled);
  };

  return (
    <form id={formId ?? id} onSubmit={handleFormSubmit} class='flex flex-col flex-1 min-h-0'>
      {cwEnabled && !isBlueskyOnly && (
        <input
          type='text'
          name='spoiler_text'
          value={cw}
          onInput={(e) => setCw((e.target as HTMLInputElement).value)}
          placeholder='注意書き（CW）'
          aria-label='注意書き（CW）'
          class='mb-2 w-full px-4 py-2 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset flex-shrink-0'
        />
      )}
      <MarkdownEditor
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        placeholder="What's on your mind? (⌘+Enter to post)"
        minHeight='150px'
        name='content'
      />

      <MediaPreviewList
        uploaded={uploaded}
        onRemove={media.remove}
        onDescriptionChange={media.setDescription}
      >
        <label class='flex items-center gap-1 text-xs text-charcoal-light dark:text-gray-400 cursor-pointer'>
          <input
            type='checkbox'
            checked={sensitive}
            disabled={hasCw || isBlueskyOnly}
            onChange={(e) => setSensitiveChecked((e.target as HTMLInputElement).checked)}
          />
          画像をセンシティブにする
        </label>
      </MediaPreviewList>
      <div class='mt-2 flex-shrink-0'>
        <PostVisibilitySelect
          value={visibility}
          onChange={handleVisibilityChange}
          name='visibility'
          id={`${formId ?? id ?? 'post-form'}-visibility`}
          disabled={isBlueskyOnly || isPosting}
        />
      </div>
      {isBlueskyOnly && (
        <div class='mt-2 flex-shrink-0'>
          <BlueskyInteractionSettings
            value={blueskyInteraction}
            onChange={setBlueskyInteraction}
            name={`${formId ?? id ?? 'post-form'}-bluesky-interaction`}
            disabled={isPosting}
          />
        </div>
      )}
      <div class='mt-2 flex flex-wrap justify-end items-center gap-3 flex-shrink-0'>
        <PostDestinationSelect
          value={destination}
          onChange={handleDestinationChange}
          name='destination'
          allowBlueskyOnly
          disabled={isPosting}
        />
        <MediaAttachButton isUploading={isUploading} onChange={media.select} />
        <button
          type='button'
          aria-pressed={cwEnabled}
          disabled={isBlueskyOnly}
          aria-label='注意書き（CW）を付ける'
          onClick={handleCwToggle}
          class={`px-2 py-1 text-xs font-medium rounded-clay border transition-colors ${
            cwEnabled
              ? 'bg-terracotta text-white border-terracotta'
              : 'text-charcoal-light dark:text-gray-400 border-warm-gray-dark dark:border-gray-600 hover:text-terracotta dark:hover:text-terracotta-light'
          }`}
        >
          CW
        </button>
        <button
          type='submit'
          disabled={isPosting || isLoadingDefault}
          class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          投稿する
        </button>
      </div>
      {crosspostNotice !== undefined && (
        <p class='mt-2 text-xs text-charcoal-light dark:text-gray-400 flex-shrink-0'>{crosspostNotice}</p>
      )}
      {notice !== undefined && (
        <p role='status' class='mt-2 text-sm text-charcoal-light dark:text-gray-400 flex-shrink-0'>
          {notice.message}
          {notice.href !== null && (
            <a
              href={notice.href}
              target='_blank'
              rel='noopener noreferrer'
              class='ml-2 underline hover:text-terracotta dark:hover:text-terracotta-light'
            >
              Bluesky で開く
            </a>
          )}
        </p>
      )}
    </form>
  );
};
