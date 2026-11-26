const isEditing = (element: Element | null): boolean =>
  element instanceof HTMLElement
  && (element.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));

const scrollsSideways = (element: Element): boolean =>
  element.scrollWidth > element.clientWidth
  && ['auto', 'scroll'].includes(getComputedStyle(element).overflowX);

const isInSidewaysScroller = (element: Element | null): boolean => {
  for (
    let current = element;
    current !== null;
    current = current.parentElement
  ) {
    if (scrollsSideways(current)) return true;
  }
  return false;
};

const keepsArrowKeys = (element: Element | null): boolean => isEditing(element) || isInSidewaysScroller(element);

type Direction = 'prev' | 'next';

const stepButton = (direction: Direction): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>(`[data-page-nav="${direction}"]`);

const go = (direction: Direction): boolean => {
  const button = stepButton(direction);
  const href = button?.dataset.href;
  if (button === null || button.disabled || href === undefined) return false;
  location.assign(href);
  return true;
};

for (const direction of ['prev', 'next'] as const) {
  stepButton(direction)?.addEventListener('click', () => go(direction));
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (
    event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey
    || event.metaKey || event.shiftKey
  ) return;
  if (keepsArrowKeys(document.activeElement)) return;
  const direction = event.key === 'ArrowLeft' ? 'prev' : 'next';
  const button = stepButton(direction);
  if (button === null || button.disabled) return;
  event.preventDefault();
  go(direction);
});

const revealCurrent = (container: HTMLElement | null): void => {
  const here = container?.querySelector<HTMLElement>('[aria-current="page"]');
  if (container == null || here == null || container.clientHeight === 0) return;
  const box = container.getBoundingClientRect();
  const rect = here.getBoundingClientRect();
  if (rect.top < box.top) container.scrollTop += rect.top - box.top;
  else if (rect.bottom > box.bottom) {
    container.scrollTop += rect.bottom - box.bottom;
  }
};

const menu = document.querySelector<HTMLDetailsElement>('.lesson-menu');

if (menu !== null) {
  const close = (): void => {
    menu.open = false;
  };

  menu.addEventListener('toggle', () => {
    if (menu.open) {
      revealCurrent(menu.querySelector<HTMLElement>('.lesson-menu__panel'));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.open) return;
    close();
    menu.querySelector('summary')?.focus();
  });

  menu.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (menu.open && next instanceof Node && !menu.contains(next)) close();
  });

  document.addEventListener('click', (event) => {
    if (
      menu.open && event.target instanceof Node && !menu.contains(event.target)
    ) close();
  });
}
