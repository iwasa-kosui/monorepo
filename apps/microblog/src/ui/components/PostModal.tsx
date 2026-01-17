import { Modal } from './Modal.tsx';

export const PostModal = () => (
  <Modal id='post-modal' showCloseButton={false}>
    <form method='post' action='/posts'>
      <textarea
        name='content'
        rows={3}
        placeholder="What's on your mind?"
        required
        class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none'
      />
      <div class='mt-3 flex gap-2 justify-end'>
        <a href='#'>
          <button
            type='button'
            class='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'
          >
            Cancel
          </button>
        </a>
        <button
          type='submit'
          class='px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-2xl transition-colors'
        >
          Post
        </button>
      </div>
    </form>
  </Modal>
);
