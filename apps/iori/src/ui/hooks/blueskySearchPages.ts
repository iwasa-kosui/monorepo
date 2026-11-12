export const nextSearchCursor = (
  requested: string | undefined,
  returned: string | null,
  itemCount: number,
): string | undefined => returned === null || itemCount === 0 || returned === requested ? undefined : returned;
