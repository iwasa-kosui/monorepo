// GitHub のメンション（@user / @org/team）を、通知が飛ぶ形で書いていないか調べる。
// コードスパン・コードブロック・HTML コメントの中はメンションにならないので除外する。

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 通知が飛ばない部分（コードブロック・コードスパン・HTML コメント）を空白に置き換える */
export const maskNonMentionable = (text) => {
  const lines = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).split("\n");
  let fence = null;
  const masked = lines.map((line) => {
    const m = line.match(FENCE);
    if (fence !== null) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return "";
    }
    if (m) {
      fence = m[1];
      return "";
    }
    return line.replace(/(`+)[\s\S]*?\1/g, (s) => " ".repeat(s.length));
  });
  return masked.join("\n");
};

// GitHub のユーザー名: 英数字とハイフン。@org/team も通知対象。
// 名前の直後が英数字・`_`・（語が続く）`.` のときはメンションにならない（例: @iori_bot、@iori.example）。
// 名前はバックトラックで短く切らない（lookahead + 後方参照で原子的に取る）。
const MENTION =
  /(^|[^A-Za-z0-9_`/.@\\-])@(?=([A-Za-z0-9][A-Za-z0-9-]*))\2(?:(\/[A-Za-z0-9_.-]+)|(?=\.+(?:[\s\W]|$)|[^A-Za-z0-9_./]|$))/g;

/**
 * @param {string} text
 * @returns {{ mention: string; line: number }[]}
 */
export const findMentions = (text) => {
  const found = [];
  maskNonMentionable(text).split("\n").forEach((line, i) => {
    for (const m of line.matchAll(MENTION)) {
      found.push({ mention: `@${m[2]}${m[3] ?? ""}`, line: i + 1 });
    }
  });
  return found;
};

export const formatReport = (source, mentions) =>
  [
    `${source} に GitHub のメンションになる記述があります。書くと相手に通知（メール）が飛びます:`,
    ...mentions.map(({ mention, line }) => `  - ${line} 行目: ${mention}`),
    "ユーザーを呼ぶ意図がなければ、`@name` のようにバッククォートで囲むか、@ を外してください。",
    "（例: bot のハンドル、npm の @scope/pkg、Fediverse の @user@host もメンションになります）",
  ].join("\n");
