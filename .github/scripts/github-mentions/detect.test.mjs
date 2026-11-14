import assert from "node:assert/strict";
import { test } from "node:test";

import { findMentions } from "./detect.mjs";

const mentions = (text) => findMentions(text).map((m) => m.mention);

test("素の @user と @org/team を見つける", () => {
  assert.deepEqual(mentions("bot（@iori）を足す"), ["@iori"]);
  assert.deepEqual(mentions("@iori を足す"), ["@iori"]);
  assert.deepEqual(mentions("@atproto/api の detectFacets"), ["@atproto/api"]);
  assert.deepEqual(mentions("Fediverse の @iori@iori.example に返信"), ["@iori"]);
});

test("コードスパン・コードブロック・HTML コメントの中は無視する", () => {
  assert.deepEqual(mentions("bot（`@iori`）を足す"), []);
  assert.deepEqual(mentions("``x @iori y``"), []);
  assert.deepEqual(mentions("```\n@iori\n```\n"), []);
  assert.deepEqual(mentions("~~~ts\nconst a = '@iori';\n~~~"), []);
  assert.deepEqual(mentions("<!-- @iori -->"), []);
  assert.deepEqual(mentions("```\n@a\n```\n@b"), ["@b"]);
});

test("メールアドレスや URL のパスは対象外", () => {
  assert.deepEqual(mentions("Co-Authored-By: Claude <noreply@anthropic.com>"), []);
  assert.deepEqual(mentions("https://example.com/@iori"), []);
  assert.deepEqual(mentions("HEAD@{1}"), []);
});

test("直後に _ や語の続く . があればメンションにならない", () => {
  assert.deepEqual(mentions("bot の @iori_bot に返信"), []);
  assert.deepEqual(mentions("@iori_bot@iori.example"), []);
  assert.deepEqual(mentions("@iori.example"), []);
  assert.deepEqual(mentions("@foo-bar_baz"), []);
  assert.deepEqual(mentions("@iori. 次の文"), ["@iori"]);
  assert.deepEqual(mentions("@iori、こんにちは"), ["@iori"]);
});

test("行番号を返す", () => {
  assert.deepEqual(findMentions("a\nb @iori"), [{ mention: "@iori", line: 2 }]);
});
