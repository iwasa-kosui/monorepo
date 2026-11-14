#!/usr/bin/env node
// 使い方:
//   node cli.mjs commit-msg <file>   git の commit-msg フック
//   node cli.mjs claude-hook         Claude Code の PreToolUse フック（stdin に JSON）
//   node cli.mjs check-pr            CI。PR_TITLE / PR_BODY と、COMMIT_RANGE のコミットメッセージを調べる
// ALLOW_GITHUB_MENTIONS=1 を付けると検査を飛ばす（意図して人を呼ぶとき）。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { findMentions, formatReport } from "./detect.mjs";

const allowed = process.env.ALLOW_GITHUB_MENTIONS === "1";

const readStdin = () => readFileSync(0, "utf8");

const commitMsg = (file) => {
  // git commit -v のときの diff と、# で始まるコメント行は本文に残らない
  const raw = readFileSync(file, "utf8").split(/^# -+ >8 -+$/m)[0];
  const text = raw.split("\n").filter((l) => !l.startsWith("#")).join("\n");
  const mentions = findMentions(text);
  if (mentions.length === 0 || allowed) return 0;
  console.error(formatReport("コミットメッセージ", mentions));
  console.error("意図したメンションなら ALLOW_GITHUB_MENTIONS=1 git commit ... で通せます。");
  return 1;
};

// MCP の GitHub ツールでリポジトリのファイル内容になる値（通知は飛ばない）
const SKIP_KEYS = new Set(["content", "path", "owner", "repo", "head", "base", "branch", "sha", "from_branch"]);

const collectStrings = (value, out = []) => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collectStrings(v, out);
  }
  return out;
};

const GITHUB_WRITING_COMMAND = /\bgit\b[^\n;&|]*\bcommit\b|\bgh\s+(pr|issue|api|release|gist)\b/;

const bodyFiles = (command) =>
  [...command.matchAll(/(?:--body-file|--file|-F)(?:\s+|=)(['"]?)([^\s'"]+)\1/g)]
    .map((m) => m[2])
    .filter((p) => !p.includes("=") && existsSync(p));

const claudeHook = () => {
  const input = JSON.parse(readStdin());
  const tool = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};
  let texts = [];
  if (tool === "Bash") {
    const command = String(toolInput.command ?? "");
    if (!GITHUB_WRITING_COMMAND.test(command)) return 0;
    // ユーザーが明示的に人を呼ぶよう頼んだときの抜け道（commit-msg フックにも同じ変数が渡る）
    if (/(^|\s)ALLOW_GITHUB_MENTIONS=1\s/.test(command)) return 0;
    texts = [command, ...bodyFiles(command).map((p) => readFileSync(p, "utf8"))];
  } else if (tool.startsWith("mcp__github__")) {
    texts = collectStrings(toolInput);
  } else {
    return 0;
  }
  const mentions = texts.flatMap((t) => findMentions(t));
  if (mentions.length === 0 || allowed) return 0;
  console.error(formatReport(`${tool} の入力`, mentions));
  console.error(
    "ユーザーが明示的にその人を呼ぶよう頼んだ場合を除き、バッククォートで囲んで書き直してください。",
  );
  return 2; // PreToolUse で exit 2 はツール呼び出しを止め、stderr を Claude に返す
};

const checkPr = () => {
  const sources = [
    ["PR のタイトル", process.env.PR_TITLE ?? ""],
    ["PR の本文", process.env.PR_BODY ?? ""],
  ];
  const range = process.env.COMMIT_RANGE;
  if (range) {
    const log = execFileSync("git", ["log", "--format=%H%x00%B%x01", range], { encoding: "utf8" });
    for (const entry of log.split("\x01")) {
      const [sha, body] = entry.trim().split("\0");
      if (sha) sources.push([`コミット ${sha.slice(0, 7)} のメッセージ`, body ?? ""]);
    }
  }
  let failed = false;
  for (const [source, text] of sources) {
    const mentions = findMentions(text);
    if (mentions.length > 0) {
      failed = true;
      console.error(formatReport(source, mentions));
      console.error("");
    }
  }
  return failed ? 1 : 0;
};

const [mode, arg] = process.argv.slice(2);
const run = { "commit-msg": () => commitMsg(arg), "claude-hook": claudeHook, "check-pr": checkPr }[mode];
if (!run) {
  console.error(`unknown mode: ${mode}`);
  process.exit(64);
}
process.exit(run());
