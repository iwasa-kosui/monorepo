import { Modal } from './Modal.tsx';
import { ProfileFormFields } from './ProfileFormFields.tsx';

type Props = Readonly<{
  displayName: string;
  note: string;
  isSubmitting: boolean;
  errorText: string | undefined;
  onSubmit: (e: Event) => void;
}>;

export const UpdateProfileModal = ({ displayName, note, isSubmitting, errorText, onSubmit }: Props) => (
  <Modal id='update-bio' showCloseButton={false}>
    <form onSubmit={onSubmit}>
      <ProfileFormFields idPrefix='update-bio' displayName={displayName} note={note} errorText={errorText} />
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
