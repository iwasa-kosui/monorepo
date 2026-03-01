import { useCallback, useEffect, useState } from 'hono/jsx';

export type UseUIStateReturn = Readonly<{
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  emojiPickerOpenForIndex: number | null;
  setEmojiPickerOpenForIndex: (index: number | null) => void;
  toggleEmojiPicker: (index: number) => void;
  scrollToSelected: (index: number) => void;
}>;

export const useUIState = (): UseUIStateReturn => {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [emojiPickerOpenForIndex, setEmojiPickerOpenForIndex] = useState<number | null>(null);

  const toggleEmojiPicker = useCallback(
    (index: number) => {
      setEmojiPickerOpenForIndex((prev) => (prev === index ? null : index));
    },
    [],
  );

  const scrollToSelected = useCallback((index: number) => {
    const postElements = document.querySelectorAll('[data-post-index]');
    const targetElement = postElements[index] as HTMLElement | undefined;
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#post-modal') {
        setSelectedIndex(-1);
      }
    };

    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return {
    selectedIndex,
    setSelectedIndex,
    emojiPickerOpenForIndex,
    setEmojiPickerOpenForIndex,
    toggleEmojiPicker,
    scrollToSelected,
  } as const;
};
