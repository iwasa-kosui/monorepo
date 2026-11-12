export const URL_PATTERN = /https?:\/\/[A-Za-z0-9][A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*/g;

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
