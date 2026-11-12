import { useEffect, useRef, useState } from 'hono/jsx';

export type PostMenuItem =
  | Readonly<{ key: string; label: string; kind: 'link'; href: string }>
  | Readonly<{
    key: string;
    label: string;
    kind: 'action';
    onSelect: () => void | Promise<void>;
    danger?: boolean;
  }>
  | Readonly<{ key: string; label: string; kind: 'copy'; text: string }>;

type Props = Readonly<{
  items: readonly PostMenuItem[];
  label?: string;
  defaultOpen?: boolean;
}>;

const NOTICE_DURATION_MS = 2000;

const itemClass = (danger: boolean): string =>
  `flex w-full items-center whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-sand-light dark:hover:bg-gray-700 ${
    danger ? 'text-terracotta-dark dark:text-terracotta' : 'text-charcoal dark:text-gray-200'
  }`;

export const PostMenu = ({ items, label = 'その他の操作', defaultOpen = false }: Props) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [notice, setNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isOpen]);

  useEffect(() => () => clearTimeout(noticeTimer.current ?? undefined), []);

  if (items.length === 0) return null;

  const showNotice = (message: string) => {
    clearTimeout(noticeTimer.current ?? undefined);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsOpen(false);
      showNotice('コピーしました');
    } catch {
      showNotice('コピーできませんでした');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!isOpen) return;
      e.preventDefault();
      setIsOpen(false);
    }
    e.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      class='relative flex items-center gap-2'
      onClick={(e: Event) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {notice !== null && <p role='status' class='text-xs text-charcoal-light dark:text-gray-400'>{notice}</p>}
      <button
        type='button'
        aria-label={label}
        aria-haspopup='menu'
        aria-expanded={isOpen ? 'true' : 'false'}
        onClick={() => setIsOpen(!isOpen)}
        class='flex items-center gap-1 transition-colors text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          class='h-5 w-5'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          stroke-width='2'
        >
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            d='M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z'
          />
        </svg>
      </button>
      {isOpen && (
        <div
          role='menu'
          class='absolute right-0 bottom-full mb-2 w-max bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark border border-warm-gray-dark dark:border-gray-700 p-2 z-50'
        >
          {items.map((item) =>
            item.kind === 'link'
              ? (
                <a
                  key={item.key}
                  href={item.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  role='menuitem'
                  onClick={() => setIsOpen(false)}
                  class={itemClass(false)}
                >
                  {item.label}
                </a>
              )
              : (
                <button
                  key={item.key}
                  type='button'
                  role='menuitem'
                  onClick={() => {
                    if (item.kind === 'copy') {
                      void copy(item.text);
                      return;
                    }
                    setIsOpen(false);
                    void item.onSelect();
                  }}
                  class={itemClass(item.kind === 'action' && item.danger === true)}
                >
                  {item.label}
                </button>
              )
          )}
        </div>
      )}
    </div>
  );
};
