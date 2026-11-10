import { sanitizePostContent } from '../../domain/post/sanitizePostContent.ts';

export const sanitizeStatusContent = (html: string): string => sanitizePostContent(html);
