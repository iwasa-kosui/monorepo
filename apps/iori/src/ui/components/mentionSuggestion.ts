/** 入力中のメンション。`start` は `@` の位置、`end` はキャレットの位置。 */
export type MentionToken = Readonly<{ start: number; end: number; query: string }>;

// サーバーの宛先の解釈（domain/post/mention.ts）と同じく、英数字・_・.・/・@ の直後の @ はメンションとみなさない
const TOKEN_BEFORE_CARET = /(?<![A-Za-z0-9_./@])@([A-Za-z0-9_][A-Za-z0-9_.-]*(?:@[A-Za-z0-9.-]*)?)$/;

/** キャレットの直前で書きかけになっているメンションを探す。`@` だけのときはまだ候補を出さない。 */
export const mentionTokenAt = (text: string, caret: number): MentionToken | undefined => {
  const match = TOKEN_BEFORE_CARET.exec(text.slice(0, caret));
  if (match === null) {
    return undefined;
  }
  return { start: caret - match[0].length, end: caret, query: match[1]! };
};

/** 書きかけのメンションを選んだ宛先に置き換え、後ろに空白を足してキャレットをその後ろへ動かす。 */
export const insertMention = (
  text: string,
  token: MentionToken,
  acct: string,
): Readonly<{ text: string; caret: number }> => {
  const after = text.slice(token.end);
  const inserted = `@${acct}${/^\s/.test(after) ? '' : ' '}`;
  return { text: `${text.slice(0, token.start)}${inserted}${after}`, caret: token.start + inserted.length };
};
