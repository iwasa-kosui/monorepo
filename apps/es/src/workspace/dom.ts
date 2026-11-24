export const must = <T extends Element>(scope: ParentNode, selector: string): T => {
  const found = scope.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`要素が見つかりません: ${selector}`);
  }
  return found;
};

export const fillText = (scope: ParentNode, selector: string, text: string): void => {
  const target = scope.querySelector(selector);
  if (target !== null) target.textContent = text;
};

export const cloneFirst = (template: HTMLTemplateElement, selector: string): HTMLElement => {
  const copy = template.content.querySelector(selector)?.cloneNode(true);
  if (!(copy instanceof HTMLElement)) {
    throw new Error(`部品が見つかりません: ${selector}`);
  }
  return copy;
};
