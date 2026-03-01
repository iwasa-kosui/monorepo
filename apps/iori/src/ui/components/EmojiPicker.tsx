import { useEffect, useRef } from 'hono/jsx';

const EMOJI_LIST = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '🤔', '😢', '😱', '🥹', '✨', '👏'] as const;

type Props = Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  isLoading?: boolean;
}>;

export const EmojiPicker = ({ isOpen, onClose, onSelect, isLoading }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Number keys 1-9 for quick selection
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= EMOJI_LIST.length) {
        e.preventDefault();
        onSelect(EMOJI_LIST[num - 1]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, onSelect]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      class='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark border border-warm-gray-dark dark:border-gray-700 p-2 z-50'
    >
      {isLoading
        ? (
          <div class='flex items-center justify-center w-48 h-20'>
            <div class='animate-spin rounded-full h-6 w-6 border-b-2 border-terracotta' />
          </div>
        )
        : (
          <div class='grid grid-cols-4 gap-1'>
            {EMOJI_LIST.map((emoji, index) => (
              <button
                key={emoji}
                type='button'
                onClick={() => onSelect(emoji)}
                class='w-10 h-10 flex items-center justify-center text-xl hover:bg-sand-light dark:hover:bg-gray-700 rounded-xl transition-colors relative group'
                title={`${emoji} (${index + 1})`}
              >
                {emoji}
                {index < 9 && (
                  <span class='absolute bottom-0 right-0.5 text-[10px] text-charcoal-light dark:text-gray-500 opacity-0 group-hover:opacity-100'>
                    {index + 1}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
    </div>
  );
};

export { EMOJI_LIST };
