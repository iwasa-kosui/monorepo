export type ProfileUpdate = Readonly<{
  displayName?: string;
  note?: string;
  avatar?: File | undefined;
  header?: File | undefined;
  removeHeader?: true;
}>;

export type ProfileInitialValues = Readonly<{
  displayName: string;
  note: string;
}>;

const normalizeNewlines = (value: string): string => value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

export const toProfileUpdate = (form: FormData, initial: ProfileInitialValues): ProfileUpdate => {
  const displayName = form.get('display_name');
  const note = form.get('note');
  const avatar = form.get('avatar');
  const header = form.get('header');
  const hasHeader = header instanceof File && header.size > 0;
  return {
    ...(typeof displayName === 'string' && displayName !== initial.displayName ? { displayName } : {}),
    ...(typeof note === 'string' && normalizeNewlines(note) !== normalizeNewlines(initial.note) ? { note } : {}),
    ...(avatar instanceof File && avatar.size > 0 ? { avatar } : {}),
    ...(hasHeader ? { header } : {}),
    // 新しいバナーを選んでいるときは、削除のチェックより差し替えを優先する
    ...(!hasHeader && form.get('remove_header') !== null ? { removeHeader: true as const } : {}),
  };
};

export const isEmptyProfileUpdate = (update: ProfileUpdate): boolean => Object.keys(update).length === 0;
