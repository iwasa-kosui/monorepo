---
name: architect-digest
disable-model-invocation: true
description: |
  設計パターン・アーキテクチャ思想、Cloud Native / CNCF、Platform Engineering / SRE、
  クラウドベンダー・業界動向など、ソフトウェアアーキテクトが注視すべき直近1ヶ月の動向を
  サブエージェントで並行調査し、private な MDX 記事として出力するスキル。
  GitHub Actions から呼ばれた場合は Draft PR も作成する。
allowed-tools: WebSearch, WebFetch, Agent, Write, Read, Glob, Bash
---

# Architect Digest

ソフトウェアアーキテクトが注視すべき直近1ヶ月の動向を調査し、kosui.me の Architect Digest 記事（private）として出力する。

## 実行手順

### ステップ1: 並行調査

以下の領域をグループ分けし、**グループごとに独立したサブエージェント（Agent）を並行起動**して調査する。
各エージェントには WebSearch と WebFetch を使わせること。

#### エージェント1: 設計パターン・アーキテクチャ思想
- **Martin Fowler blog**: 検索クエリ例 `site:martinfowler.com/bliki`, `Martin Fowler new article`。新しいbliki記事やリファクタリング・設計に関する発信
- **InfoQ Architecture & Design**: 検索クエリ例 `site:infoq.com architecture`, `InfoQ software architecture`。アーキテクチャに関する記事、インタビュー、プレゼンテーション
- **ThoughtWorks Technology Radar**: 検索クエリ例 `ThoughtWorks Technology Radar`, `site:thoughtworks.com/radar`。新しいRadarの公開、注目のAdopt/Trial/Assess/Hold項目
- **DDD / CQRS / Event Sourcing**: 検索クエリ例 `Domain-Driven Design news`, `CQRS Event Sourcing update`, `site:eventstore.com/blog`。コミュニティの議論、新しいパターンや実践事例

#### エージェント2: Cloud Native / CNCF
- **CNCF プロジェクト動向**: 検索クエリ例 `CNCF project graduation`, `CNCF incubation sandbox`, `site:cncf.io/blog`。卒業・インキュベーション昇格・サンドボックス採択
- **Kubernetes**: 検索クエリ例 `Kubernetes release blog site:kubernetes.io`, `KEP site:github.com/kubernetes/enhancements`。新リリースと主な変更点、注目のKEP
- **OpenTelemetry**: 検索クエリ例 `OpenTelemetry release`, `site:opentelemetry.io/blog`, `OpenTelemetry specification update`。仕様・SDK・Collectorの更新
- **Service Mesh / eBPF**: 検索クエリ例 `Istio release`, `Linkerd update`, `Cilium eBPF news`。Istio, Linkerd, Ciliumの動向

#### エージェント3: Platform Engineering / SRE / Observability
- **Platform Engineering**: 検索クエリ例 `Platform Engineering news`, `Internal Developer Platform`, `site:platformengineering.org`。コミュニティの動向、IDPの事例
- **IaC**: 検索クエリ例 `Terraform release`, `OpenTofu update`, `Pulumi release blog`。Terraform, OpenTofu, Pulumiの新リリースや機能追加
- **SRE プラクティス**: 検索クエリ例 `SRE practices update`, `site:sre.google`, `reliability engineering blog`。SREコミュニティの新しいプラクティスやツール
- **Observability**: 検索クエリ例 `Grafana release blog`, `Prometheus update`, `eBPF observability`。Grafana, Prometheus, eBPFベースのObservabilityツールの動向

#### エージェント4: クラウドベンダー・業界動向
- **AWS**: 検索クエリ例 `AWS architecture blog site:aws.amazon.com/blogs/architecture`, `AWS What's New`。アーキテクチャブログの新記事、主要サービスのアップデート
- **GCP**: 検索クエリ例 `Google Cloud architecture blog site:cloud.google.com/blog`, `GCP release notes`。アーキテクチャブログの新記事、主要サービスのアップデート
- **テック企業エンジニアリングブログ**: 検索クエリ例 `Netflix tech blog`, `Uber engineering blog`, `Spotify engineering blog`。Netflix, Uber, Spotify等のアーキテクチャ事例
- **カンファレンス・論文**: 検索クエリ例 `QCon conference talks`, `GOTO conference`, `InfoQ presentations`。QCon, GOTO, InfoQ等の注目セッションや論文

### ステップ2: MDX記事の作成

調査結果を統合し、MDX記事を作成する。

#### 日付の決定

今日の日付（YYYY-MM-DD形式）を使う。currentDate コンテキストまたはプロンプトで指定された日付があればそれを使用する。

#### ファイルパス

`apps/kosui-me/src/content/posts/{DATE}-architect-digest.mdx`

#### 既存記事の参照

記事を書く前に、直近の既存記事を Read ツールで1つ読み、文体・構成を参考にする:

```
apps/kosui-me/src/content/posts/*-weekly-tech-digest.mdx
```

#### frontmatter

```yaml
---
title: "Architect Digest: {DATE}"
date: "{DATE}T12:00:00+09:00"
slug: "posts/{YYYY}/{MM}/{DD}/architect-digest"
description: "（調査内容に基づく1行要約）"
tags: ["Architect"]
private: true
---
```

#### 記事本文の書き方

- 冒頭に2〜3文の概要を書く
- セクション見出し（##）でカテゴリ分け（設計パターン、Cloud Native、Platform Engineeringなど）
- 各トピックは ### で見出しをつけ、情報源のリンクを貼り、箇条書きで要点をまとめる
- 横断的な注目トピックがあれば冒頭の概要に含める

### ステップ3: Draft PR の作成（GitHub Actions 環境の場合のみ）

環境変数 `GITHUB_ACTIONS` が設定されている場合のみ実行する。ローカル実行時はスキップする。

Bash ツールで以下を実行する:

1. ブランチ `architect-digest/{DATE}` を作成してチェックアウト
2. 作成したMDXファイルをコミット
   - メッセージ: `feat(kosui-me): add Architect Digest {DATE}`
   - `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
3. リモートにプッシュ
4. `gh pr create --draft` でDraft PRを作成
   - タイトル: `feat(kosui-me): Architect Digest {DATE}`

### ルール

- 各トピックについて、情報源の URL を明記する
- 確認できなかった情報は「確認できず」と正直に書く。推測で埋めない
- レポートは簡潔にまとめる。各セクション3〜8項目程度
- 追加の調査領域がpromptで指定された場合は、そのサブエージェントも追加起動する
