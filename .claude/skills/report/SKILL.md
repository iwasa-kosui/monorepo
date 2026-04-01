---
name: report
disable-model-invocation: true
description: |
  任意のテーマについて、サブエージェントで並行調査し、kosui.me の reports コレクションに
  MDX レポート記事として出力する汎用レポート作成スキル。
  テーマ特化のスキル（report-architect-digest, report-web-standards-digest）で
  カバーされない領域に使う。
  調査完了後に Draft PR を作成する。
allowed-tools: WebSearch, WebFetch, Agent, Write, Read, Glob, Bash
---

# Report

任意のテーマについてWeb調査を行い、kosui.me の reports コレクションに MDX レポート記事として出力する。

## 前提

呼び出し時のプロンプトに以下が含まれている必要がある:

- **テーマ**: 調査対象の領域（例: "AI Agent フレームワーク動向", "Rust エコシステム最新動向"）
- **調査軸**（任意）: 調査を分割するカテゴリのリスト。省略時はテーマから自動で3〜5軸を決定する
- **slug suffix**: ファイル名・URLに使う英字ケバブケース（例: `ai-agent-frameworks`）
- **tags**: frontmatter に設定するタグのリスト
- **日付**（任意）: YYYY-MM-DD形式。省略時は currentDate を使う

## 実行手順

### ステップ1: 調査軸の決定

プロンプトで調査軸が指定されている場合はそれを使う。指定がない場合は、テーマを分析して3〜5個の調査軸を決定する。各軸が独立して並行調査できる粒度にすること。

### ステップ2: 並行調査

調査軸ごとに独立したサブエージェント（Agent）を並行起動して調査する。各エージェントには WebSearch と WebFetch を使わせること。

各エージェントへの指示には以下を含める:

- 調査対象の具体的なキーワード・サイト
- 検索クエリの例（`site:` 指定を含む）
- 直近1ヶ月の情報を優先する旨

### ステップ3: MDX記事の作成

調査結果を統合し、MDX記事を作成する。

#### ファイルパス

`apps/kosui-me/src/content/reports/{DATE}-{SLUG_SUFFIX}.mdx`

#### 既存記事の参照

記事を書く前に、直近の既存記事を Read ツールで1つ読み、文体・構成を参考にする:

```
apps/kosui-me/src/content/reports/*.mdx
```

#### frontmatter

```yaml
---
title: "{記事タイトル}"
date: "{DATE}T12:00:00+09:00"
slug: "{YYYY}/{MM}/{DD}/{SLUG_SUFFIX}"
description: "（調査内容に基づく1行要約）"
tags: [{指定されたタグ}]
---
```

#### 記事本文の書き方

- 冒頭に2〜3文の概要を書く
- セクション見出し（##）で調査軸ごとにカテゴリ分け
- 各トピックは ### で見出しをつけ、情報源のリンクを貼り、箇条書きで要点をまとめる
- 横断的な注目トピックがあれば冒頭の概要に含める

### ステップ4: Draft PR の作成

Bash ツールで以下を実行する:

1. ブランチ `report/{SLUG_SUFFIX}/{DATE}` を作成してチェックアウト
2. 作成したMDXファイルをコミット
   - メッセージ: `feat(kosui-me): add {記事タイトル}`
   - `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
3. リモートにプッシュ
4. `gh pr create --draft` でDraft PRを作成
   - タイトル: `feat(kosui-me): {記事タイトル}`

### ルール

- 各トピックについて、情報源の URL を明記する
- 確認できなかった情報は「確認できず」と正直に書く。推測で埋めない
- レポートは簡潔にまとめる。各セクション3〜8項目程度
- 追加の調査領域がpromptで指定された場合は、そのサブエージェントも追加起動する
