import { parseTextSize, TEXT_SIZE_ATTRIBUTE, TEXT_SIZE_KEY, type TextSize, textSizeAttribute } from './text-size';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const loadTextSize = (): TextSize => {
  try {
    return parseTextSize(storage()?.getItem(TEXT_SIZE_KEY));
  } catch {
    return parseTextSize(null);
  }
};

const saveTextSize = (size: TextSize): void => {
  try {
    storage()?.setItem(TEXT_SIZE_KEY, size);
  } catch {
    return;
  }
};

const inputs = (): readonly HTMLInputElement[] =>
  Array.from(document.querySelectorAll<HTMLInputElement>('input[data-text-size-input]'));

const render = (size: TextSize): void => {
  const attribute = textSizeAttribute(size);
  if (attribute === null) {
    document.documentElement.removeAttribute(TEXT_SIZE_ATTRIBUTE);
  } else {
    document.documentElement.setAttribute(TEXT_SIZE_ATTRIBUTE, attribute);
  }
  for (const input of inputs()) {
    input.checked = input.value === size;
  }
};

const apply = (size: TextSize): void => {
  render(size);
  window.dispatchEvent(new Event('resize'));
};

render(loadTextSize());

for (const input of inputs()) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    const size = parseTextSize(input.value);
    saveTextSize(size);
    apply(size);
  });
}

window.addEventListener('storage', (event) => {
  if (event.key !== TEXT_SIZE_KEY && event.key !== null) return;
  apply(loadTextSize());
});
