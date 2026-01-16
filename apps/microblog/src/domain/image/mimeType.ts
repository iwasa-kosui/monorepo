/**
 * Gets the MIME type for an image based on its URL extension.
 * Returns "application/octet-stream" if the extension is not recognized.
 */
export const getMimeTypeFromUrl = (url: string): string => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".png")) {
    return "image/png";
  }
  if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerUrl.endsWith(".gif")) {
    return "image/gif";
  }
  if (lowerUrl.endsWith(".webp")) {
    return "image/webp";
  }
  return "application/octet-stream";
};
