export type PageRoute = 'past' | 'current' | 'future';

export type PageGroup<T> = {
  readonly chapter: string;
  readonly members: readonly { readonly page: T; readonly route: PageRoute }[];
  readonly hasCurrent: boolean;
};

export type OverallPosition<T> = {
  readonly page: T;
  readonly number: number;
  readonly total: number;
};

const routeOf = (index: number, current: number): PageRoute =>
  index === current ? 'current' : index < current ? 'past' : 'future';

export const groupPages = <T extends { readonly chapter: string }>(
  pages: readonly T[],
  current: number,
): readonly PageGroup<T>[] => {
  if (pages[current] === undefined) {
    throw new Error(`現在のページの位置が範囲外です: ${current}`);
  }
  const groups: { chapter: string; members: { page: T; route: PageRoute }[] }[] = [];
  pages.forEach((page, index) => {
    const member = { page, route: routeOf(index, current) };
    const last = groups.at(-1);
    if (last?.chapter === page.chapter) last.members.push(member);
    else groups.push({ chapter: page.chapter, members: [member] });
  });
  return groups.map((group) => ({
    ...group,
    hasCurrent: group.members.some((member) => member.route === 'current'),
  }));
};

export const overallPosition = <T extends { readonly chapter: string; readonly number: number }>(
  pages: readonly T[],
  chapter: string,
  number: number,
): OverallPosition<T> | undefined => {
  const index = pages.findIndex((page) => page.chapter === chapter && page.number === number);
  const page = pages[index];
  return page === undefined ? undefined : { page, number: index + 1, total: pages.length };
};
