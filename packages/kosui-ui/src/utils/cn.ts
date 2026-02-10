export function cn(
  ...inputs: readonly (string | false | null | undefined)[]
): string {
  return inputs.filter(Boolean).join(' ');
}
