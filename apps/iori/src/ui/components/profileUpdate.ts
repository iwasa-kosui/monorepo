export type ProfileUpdate = Readonly<{
  displayName: string;
  note: string;
  avatar: File | undefined;
}>;

export const toProfileUpdate = (form: FormData): ProfileUpdate => {
  const displayName = form.get('display_name');
  const note = form.get('note');
  const avatar = form.get('avatar');
  return {
    displayName: typeof displayName === 'string' ? displayName : '',
    note: typeof note === 'string' ? note : '',
    avatar: avatar instanceof File && avatar.size > 0 ? avatar : undefined,
  };
};
