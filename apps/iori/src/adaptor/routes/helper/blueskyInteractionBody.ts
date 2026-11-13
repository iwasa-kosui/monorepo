import { BlueskyInteraction, BlueskyReplyRestriction } from '../../../domain/blueskyCrosspost/blueskyInteraction.ts';
import { bodyBoolean, type RequestBody } from './requestBody.ts';

export type BlueskyInteractionBody =
  | Readonly<{ interaction: BlueskyInteraction }>
  | Readonly<{ error: string }>;

const REPLY_ALLOW_ERROR = 'reply_allow には mention・following・followers のどれかを配列で指定してください';
const QUOTE_DISABLED_ERROR = 'quote_disabled には true か false を指定してください';
const falseTexts = ['false', '0', 'off', 'f', 'no', ''];

const replyRestrictionOf = (value: unknown): BlueskyReplyRestriction | undefined => {
  if (value === undefined) return 'everyone';
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list)) return undefined;
  const parsed = BlueskyReplyRestriction.parse(list);
  return parsed.ok ? parsed.val : undefined;
};

const quoteDisabledOf = (value: unknown): boolean | undefined => {
  if (value === undefined || typeof value === 'boolean') return value ?? false;
  if (typeof value !== 'string') return undefined;
  if (falseTexts.includes(value.toLowerCase())) return false;
  return bodyBoolean({ value }, 'value') ? true : undefined;
};

export const blueskyInteractionOf = (body: RequestBody): BlueskyInteractionBody => {
  const replyRestriction = replyRestrictionOf(body['reply_allow']);
  if (replyRestriction === undefined) return { error: REPLY_ALLOW_ERROR };
  const quoteDisabled = quoteDisabledOf(body['quote_disabled']);
  if (quoteDisabled === undefined) return { error: QUOTE_DISABLED_ERROR };
  return { interaction: { replyRestriction, quoteDisabled } };
};
