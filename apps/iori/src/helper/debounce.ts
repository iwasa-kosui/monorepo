export const debounce = <T extends unknown[]>(
  func: (...args: T) => void,
  wait: number,
) => {
  let timeoutId: NodeJS.Timeout | undefined;
  return (...args: T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
};
