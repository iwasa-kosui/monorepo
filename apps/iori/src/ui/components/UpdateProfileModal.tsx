import { Modal } from './Modal.tsx';

type Props = Readonly<{
  displayName: string;
  note: string;
  isSubmitting: boolean;
  errorText: string | undefined;
  onSubmit: (e: Event) => void;
}>;

const FIELD_CLASS =
  'w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset mb-3 transition-all';
const LABEL_CLASS = 'block text-charcoal-light dark:text-gray-400 text-sm mb-1';

export const UpdateProfileModal = ({ displayName, note, isSubmitting, errorText, onSubmit }: Props) => (
  <Modal id='update-bio' showCloseButton={false}>
    <form onSubmit={onSubmit}>
      <label class={LABEL_CLASS} for='update-bio-display-name'>Display name</label>
      <input
        id='update-bio-display-name'
        type='text'
        name='display_name'
        value={displayName}
        class={FIELD_CLASS}
      />
      <label class={LABEL_CLASS} for='update-bio-note'>Bio</label>
      <textarea id='update-bio-note' name='note' value={note} rows={4} class={FIELD_CLASS} />
      <label class={LABEL_CLASS} for='update-bio-avatar'>
        Profile image (JPEG, PNG, GIF or WebP, up to 5MB)
      </label>
      <input
        id='update-bio-avatar'
        type='file'
        name='avatar'
        accept='image/jpeg,image/png,image/gif,image/webp'
        class={FIELD_CLASS}
      />
      {errorText !== undefined && <p class='text-terracotta text-sm mb-3'>{errorText}</p>}
      <div class='flex gap-2 justify-end'>
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
          disabled={isSubmitting}
          class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          {isSubmitting ? 'Updating...' : 'Update'}
        </button>
      </div>
    </form>
  </Modal>
);
