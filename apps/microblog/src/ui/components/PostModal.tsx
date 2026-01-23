import { useRef, useState } from 'hono/jsx';

import { MarkdownEditor } from './MarkdownEditor.tsx';
import { Modal } from './Modal.tsx';

export const PostModal = () => {
  const [content, setContent] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (formRef.current && content.trim()) {
        formRef.current.submit();
      }
    }
  };

  return (
    <Modal
      id='post-modal'
      showCloseButton={false}
      fullScreen
    >
      <form method='post' action='/posts' ref={formRef} class='flex flex-col flex-1 min-h-0'>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind? (⌘+Enter to post)"
          minHeight='200px'
          name='content'
        />

        <div class='mt-3 flex gap-2 justify-end'>
          <a href='#'>
            <button
              type='button'
              class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
            >
              Cancel
            </button>
          </a>
          <button
            type='submit'
            class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
          >
            投稿する
          </button>
        </div>
      </form>
    </Modal>
  );
};
