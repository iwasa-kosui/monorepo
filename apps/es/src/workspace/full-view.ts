export const fullViewAttribute = 'data-work-full';

type Branch<T> = {
  readonly parentElement: T | null;
  readonly children: Iterable<T>;
};

// 全画面のあいだ裏に隠れる要素を集める。root から frame の直下までさかのぼり、各階層の兄弟を返す
export const backdropOf = <T extends Branch<T>>(root: T, frame: T): readonly T[] => {
  const found: T[] = [];
  for (let current = root; current !== frame;) {
    const parent = current.parentElement;
    if (parent === null) return [];
    for (const sibling of parent.children) {
      if (sibling !== current) found.push(sibling);
    }
    current = parent;
  }
  return found;
};
