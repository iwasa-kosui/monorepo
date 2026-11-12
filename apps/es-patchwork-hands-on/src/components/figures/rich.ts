const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const richHtml = (text: string): string => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
