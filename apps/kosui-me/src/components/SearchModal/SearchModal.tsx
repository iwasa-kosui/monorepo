import { useCallback, useEffect, useRef, useState } from 'react';

import { usePagefind } from './usePagefind';

export function SearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { state, search, reset, loadPagefind } = usePagefind();

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

  const open = useCallback(() => {
    setIsOpen(true);
    loadPagefind();
  }, [loadPagefind]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
    reset();
  }, [reset]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  }, [isOpen, open, close]);

  // Custom event from Astro trigger buttons
  useEffect(() => {
    function handleOpenSearch() {
      open();
    }
    document.addEventListener('open-search', handleOpenSearch);
    return () => document.removeEventListener('open-search', handleOpenSearch);
  }, [open]);

  // Re-register on Astro view transitions
  useEffect(() => {
    function handlePageLoad() {
      close();
    }
    document.addEventListener('astro:page-load', handlePageLoad);
    return () => document.removeEventListener('astro:page-load', handlePageLoad);
  }, [close]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setActiveIndex(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        search(value);
      }, 300);
    },
    [search],
  );

  const results = state.status === 'results' ? state.results : [];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && results[activeIndex]) {
        window.location.href = results[activeIndex].url;
      }
    },
    [close, results, activeIndex],
  );

  if (!isOpen) {
    return null;
  }

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className='fixed inset-0 z-50 flex items-start justify-center pt-[15vh]'
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role='presentation'
    >
      {/* Backdrop */}
      <div className='absolute inset-0 bg-charcoal/30 dark:bg-black/50 backdrop-blur-sm' />

      {/* Dialog */}
      <div
        className={`relative w-full max-w-2xl mx-4 bg-card dark:bg-[#1c1c22] rounded-clay shadow-clay-hover dark:shadow-clay-dark-hover overflow-hidden ${
          !prefersReduced ? 'animate-[searchModalIn_0.2s_ease-out]' : ''
        }`}
        role='dialog'
        aria-modal='true'
        aria-label='サイト内検索'
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className='flex items-center gap-3 px-4 py-3 border-b border-border dark:border-[#2a2a32]'>
          <svg
            className='w-5 h-5 text-subtle dark:text-[#9ca3af] shrink-0'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
            />
          </svg>
          <input
            ref={inputRef}
            type='text'
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder='記事やトークを検索...'
            className='flex-1 bg-transparent text-charcoal dark:text-[#ececec] placeholder:text-subtle dark:placeholder:text-[#9ca3af] outline-none text-base'
          />
          <kbd className='hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-subtle dark:text-[#9ca3af] bg-tag-bg dark:bg-[#2a2a32] rounded font-mono'>
            {isMac ? '⌘' : 'Ctrl'}K
          </kbd>
        </div>

        {/* Results */}
        <div className='max-h-[50vh] overflow-y-auto'>
          {state.status === 'loading' && (
            <div className='px-4 py-8 text-center text-subtle dark:text-[#9ca3af] text-sm'>
              検索中...
            </div>
          )}

          {state.status === 'no-results' && (
            <div className='px-4 py-8 text-center text-subtle dark:text-[#9ca3af] text-sm'>
              検索結果が見つかりませんでした
            </div>
          )}

          {state.status === 'dev-unavailable' && (
            <div className='px-4 py-8 text-center text-subtle dark:text-[#9ca3af] text-sm'>
              開発環境では検索を利用できません
            </div>
          )}

          {state.status === 'results'
            && results.map((result, index) => (
              <a
                key={result.url}
                href={result.url}
                className={`block px-4 py-3 border-b border-border/50 dark:border-[#2a2a32]/50 last:border-b-0 transition-colors ${
                  index === activeIndex
                    ? 'bg-accent/5 dark:bg-accent/10'
                    : 'hover:bg-tag-bg dark:hover:bg-[#2a2a32]'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className='flex items-center gap-2 mb-1'>
                  <span className='text-sm font-medium text-charcoal dark:text-[#ececec]'>
                    {result.title}
                  </span>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded-full font-medium ${
                      result.type === 'talk'
                        ? 'bg-accent/10 dark:bg-accent-light/10 text-accent dark:text-accent-light'
                        : 'bg-tag-bg dark:bg-[#2a2a32] text-subtle dark:text-[#9ca3af]'
                    }`}
                  >
                    {result.type === 'talk' ? 'Talk' : 'Post'}
                  </span>
                </div>
                <div
                  className='text-xs text-subtle dark:text-[#9ca3af] line-clamp-2 [&_mark]:bg-accent/20 [&_mark]:text-charcoal dark:[&_mark]:bg-accent/30 dark:[&_mark]:text-[#ececec]'
                  dangerouslySetInnerHTML={{ __html: result.excerpt }}
                />
              </a>
            ))}

          {state.status === 'idle' && query === '' && (
            <div className='px-4 py-6 text-center text-subtle dark:text-[#9ca3af] text-xs'>
              キーワードを入力して検索
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
