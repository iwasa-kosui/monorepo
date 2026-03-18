---
name: web-standards-digest
disable-model-invocation: true
description: |
  WinterTC, Node.js, TypeScript, ECMAScript, Deno, Bun, V8, Hono, Effect, Zod など
  Web 標準・ランタイム・サーバサイドTSエコシステムの直近1ヶ月の動向を
  サブエージェントで並行調査し、サマリレポートとして報告するスキル。
allowed-tools: WebSearch, WebFetch, Agent
---

# Web Standards Digest

Web標準・ランタイム・サーバサイドTSエコシステムの直近1ヶ月の動向を調査してレポートする。

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

### ステップ2: レポート作成

各サブエージェントの結果を統合し、以下のフォーマットでレポートを作成する。

```markdown
# Web Standards Digest（YYYY-MM-DD）

対象期間: YYYY-MM-DD 〜 YYYY-MM-DD

## 標準化動向
### WinterTC
- ...
### TC39 / ECMAScript
- ...

## ランタイム
### Node.js
- ...
### Deno
- ...
### Bun
- ...

## 言語・エンジン
### TypeScript
- ...
### V8
- ...

## エコシステム
### Hono
- ...
### Effect
- ...
### Zod
- ...

## 横断的な注目トピック
（複数領域にまたがるトレンドがあれば記載）
```

### ルール

- 各トピックについて、情報源の URL を明記する
- 確認できなかった情報は「確認できず」と正直に書く。推測で埋めない
- レポートは簡潔にまとめる。各セクション3〜8項目程度
- 追加の調査領域がpromptで指定された場合は、そのサブエージェントも追加起動する
