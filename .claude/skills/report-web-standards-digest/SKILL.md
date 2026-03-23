---
name: report-web-standards-digest
disable-model-invocation: true
description: |
  WinterTC, Node.js, TypeScript, ECMAScript, Deno, Bun, V8, Hono, Effect, Zod など
  Web 標準・ランタイム・サーバサイドTSエコシステムの直近1ヶ月の動向を
  サブエージェントで並行調査し、reports コレクションの MDX 記事として出力するスキル。
  Draft PR も作成する。
allowed-tools: WebSearch, WebFetch, Agent, Write, Read, Glob, Bash
---

# Web Standards Digest

Web標準・ランタイム・サーバサイドTSエコシステムの直近1ヶ月の動向を調査し、kosui.me の reports コレクションに Weekly Tech Digest 記事として出力する。

## 実行手順

### ステップ1: 並行調査

以下の領域をグループ分けし、**グループごとに独立したサブエージェント（Agent）を並行起動**して調査する。
各エージェントには WebSearch と WebFetch を使わせること。

#### エージェント1: 標準化動向（WinterTC / TC39）
- **WinterTC（旧 WinterCG）**: 検索クエリ例 `WinterTC site:github.com`, `WinterTC meeting notes`, `WinterTC proposal`。新しい提案やミーティングノートの要旨
- **TC39 / ECMAScript**: 検索クエリ例 `TC39 proposal stage advancement`, `TC39 meeting notes site:github.com/tc39`。ステージ昇格した提案、新規提案（Stage 0/1 入り）、Ecma International からの公式アナウンス

#### エージェント2: ランタイム（Node.js / Deno / Bun）
- **Node.js**: 検索クエリ例 `Node.js release blog nodejs.org`, `Node.js changelog site:github.com/nodejs/node`。新リリース（LTS / Current）と主な変更点、注目の RFC や実験的機能、セキュリティアドバイザリ
- **Deno**: 検索クエリ例 `Deno release site:deno.com/blog`, `Deno changelog site:github.com/denoland/deno`。新リリースと主な変更点、Node.js互換性の進捗、Fresh等エコシステムの動き
- **Bun**: 検索クエリ例 `Bun release site:bun.sh/blog`, `Bun changelog site:github.com/oven-sh/bun`。新リリースと主な変更点、Node.js API互換性の進捗、パフォーマンス改善

#### エージェント3: TypeScript / V8
- **TypeScript**: 検索クエリ例 `TypeScript release site:devblogs.microsoft.com`, `TypeScript site:github.com/microsoft/TypeScript milestone`。新リリースやベータ/RC、注目の型システム改善、破壊的変更、ロードマップの更新
- **V8**: 検索クエリ例 `V8 release site:v8.dev/blog`, `V8 changelog`。新リリースと主なJS/Wasm機能、パフォーマンス最適化（Maglev, Turboshaft等）

#### エージェント4: エコシステム（Hono / Effect / Zod）
- **Hono**: 検索クエリ例 `Hono release site:github.com/honojs/hono`, `Hono blog`。新リリースと主な変更点、新しいミドルウェアやアダプタ
- **Effect**: 検索クエリ例 `Effect release site:github.com/Effect-TS/effect`, `Effect blog site:effect.website`。新リリースと主な変更点、APIの破壊的変更、新モジュール追加
- **Zod**: 検索クエリ例 `Zod release site:github.com/colinhacks/zod`, `Zod v4`。新リリースと主な変更点、パフォーマンス改善、新機能

### ステップ2: MDX記事の作成

調査結果を統合し、MDX記事を作成する。

#### 日付の決定

今日の日付（YYYY-MM-DD形式）を使う。currentDate コンテキストまたはプロンプトで指定された日付があればそれを使用する。

#### ファイルパス

`apps/kosui-me/src/content/reports/{DATE}-weekly-tech-digest.mdx`

#### 既存記事の参照

記事を書く前に、直近の既存記事を Read ツールで1つ読み、文体・構成を参考にする:

```
apps/kosui-me/src/content/reports/*-weekly-tech-digest.mdx
```

#### frontmatter

```yaml
---
title: "Weekly Tech Digest: {DATE}"
date: "{DATE}T12:00:00+09:00"
slug: "{YYYY}/{MM}/{DD}/weekly-tech-digest"
description: "（調査内容に基づく1行要約）"
tags: ["Weekly"]
---
```

#### 記事本文の書き方

- 冒頭に2〜3文の概要を書く
- セクション見出し（##）でカテゴリ分け（標準化動向、言語・ランタイム、エコシステムなど）
- 各トピックは ### で見出しをつけ、情報源のリンクを貼り、箇条書きで要点をまとめる
- Web Standards Digest の結果のみを記載する（他カテゴリは後で手動追記する前提）
- 横断的な注目トピックがあれば冒頭の概要に含める

### ステップ3: Draft PR の作成

Bash ツールで以下を実行する:

1. ブランチ `weekly-tech-digest/{DATE}` を作成してチェックアウト
2. 作成したMDXファイルをコミット
   - メッセージ: `feat(kosui-me): add Weekly Tech Digest {DATE}`
   - `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
3. リモートにプッシュ
4. `gh pr create --draft` でDraft PRを作成
   - タイトル: `feat(kosui-me): Weekly Tech Digest {DATE}`

### ルール

- 各トピックについて、情報源の URL を明記する
- 確認できなかった情報は「確認できず」と正直に書く。推測で埋めない
- レポートは簡潔にまとめる。各セクション3〜8項目程度
- 追加の調査領域がpromptで指定された場合は、そのサブエージェントも追加起動する
