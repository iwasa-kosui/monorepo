export type ProfileUpdate = Readonly<{
  displayName?: string;
  note?: string;
  avatar?: File | undefined;
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
  return {
    ...(typeof displayName === 'string' && displayName !== initial.displayName ? { displayName } : {}),
    ...(typeof note === 'string' && normalizeNewlines(note) !== normalizeNewlines(initial.note) ? { note } : {}),
    ...(avatar instanceof File && avatar.size > 0 ? { avatar } : {}),
  };
};

export const isEmptyProfileUpdate = (update: ProfileUpdate): boolean => Object.keys(update).length === 0;
