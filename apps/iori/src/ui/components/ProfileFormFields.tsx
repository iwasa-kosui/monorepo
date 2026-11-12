type Props = Readonly<{
  idPrefix: string;
  displayName: string;
  note: string;
  errorText: string | undefined;
}>;

const FIELD_CLASS =
  'w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset mb-3 transition-all';
const LABEL_CLASS = 'block text-charcoal-light dark:text-gray-400 text-sm mb-1';

export const ProfileFormFields = ({ idPrefix, displayName, note, errorText }: Props) => (
  <>
    <label class={LABEL_CLASS} for={`${idPrefix}-display-name`}>表示名</label>
    <input
      id={`${idPrefix}-display-name`}
      type='text'
      name='display_name'
      value={displayName}
      class={FIELD_CLASS}
    />
    <label class={LABEL_CLASS} for={`${idPrefix}-note`}>自己紹介</label>
    <textarea id={`${idPrefix}-note`} name='note' value={note} rows={4} class={FIELD_CLASS} />
    <label class={LABEL_CLASS} for={`${idPrefix}-avatar`}>
      プロフィール画像（JPEG、PNG、GIF、WebP のいずれか。5MB まで）
    </label>
    <input
      id={`${idPrefix}-avatar`}
      type='file'
      name='avatar'
      accept='image/jpeg,image/png,image/gif,image/webp'
      class={FIELD_CLASS}
    />
    {errorText !== undefined && <p class='text-terracotta text-sm mb-3'>{errorText}</p>}
  </>
);
