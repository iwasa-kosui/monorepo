---
name: report-architect-digest
disable-model-invocation: true
description: |
  設計パターン・アーキテクチャ思想、Cloud Native / CNCF、Platform Engineering / SRE、
  クラウドベンダー・業界動向など、ソフトウェアアーキテクトが注視すべき直近1ヶ月の動向を
  サブエージェントで並行調査し、reports コレクションの MDX 記事として出力するスキル。
  記事を書き終えたらローカル・GitHub Actions のいずれの環境でも Draft PR を作成する。
allowed-tools: WebSearch, WebFetch, Agent, Write, Read, Glob, Bash
---

# Architect Digest

ソフトウェアアーキテクトが注視すべき直近1ヶ月の動向を調査し、kosui.me の reports コレクションに Architect Digest 記事として出力する。

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

`apps/kosui-me/src/content/reports/{DATE}-architect-digest.mdx`

#### 既存記事の参照

記事を書く前に、直近の既存記事を Read ツールで1つ読み、文体・構成を参考にする:

```
apps/kosui-me/src/content/reports/*-architect-digest.mdx
```

#### frontmatter

```yaml
---
title: "Architect Digest: {DATE}"
date: "{DATE}T12:00:00+09:00"
slug: "{YYYY}/{MM}/{DD}/architect-digest"
description: "（調査内容に基づく1行要約）"
tags: ["Architect"]
---
```

#### 記事本文の書き方

- 冒頭に2〜3文の概要を書く
- セクション見出し（##）でカテゴリ分け（設計パターン、Cloud Native、Platform Engineeringなど）
- 各トピックは ### で見出しをつけ、情報源のリンクを貼り、箇条書きで要点をまとめる
- 横断的な注目トピックがあれば冒頭の概要に含める

### ステップ3: Draft PR の作成

ローカル実行・GitHub Actions のいずれでも Draft PR を作成する。手順は `pr` skill の規約に揃える（draft / Conventional Commits / 一時ファイル経由の `--body-file` / リポジトリ PR テンプレート遵守）。

Bash ツールで以下を実行する:

1. ブランチ名は `architect-digest-{DATE}` 形式（ハイフン区切り）。`architect-digest` という親階層的なブランチが既に存在する場合、`architect-digest/{DATE}` のようなスラッシュ区切り名は ref ロックの衝突で作成できないため避ける
   - worktree 配下で既にこの名前のブランチが切られている場合はそれをそのまま使う
2. MDXファイルを `git add <path>` でステージ（`git add -A` / `git add .` は使わない）し、コミットする
   - メッセージ: `docs(kosui-me): Architect Digest {DATE} を追加`
   - Co-Authored-By 行はその時点で使っているモデル名に合わせる（例: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`）
3. `git push -u origin architect-digest-{DATE}` でリモートに upstream tracking 付きでプッシュ
   - 直後の `gh pr create` が `No commits between main and ...` で失敗する場合は、`git ls-remote origin <branch>` で remote 反映を確認し、必要なら `git push origin <branch>:refs/heads/<branch>` で再プッシュする
4. リポジトリ PR テンプレート（`.github/PULL_REQUEST_TEMPLATE.md`）を `find . -maxdepth 3 -iname '*pull_request_template*'` で確認し、存在すればその構造を厳守して本文を作る
5. 本文は一時ファイルに書き出して `gh pr create --draft --base main --head architect-digest-{DATE} --title "docs(kosui-me): Architect Digest {DATE}" --body-file /tmp/pr-body-adigest.md` で Draft PR を作成
   - 本文の各セクションは記事の中身を羅列するのではなく、月次レポートで採り上げた主要トピックの分類・通底テーマ・補足（ソースの信頼度や注意点など）にとどめる
6. 作成された PR URL をユーザーに返す

### ルール

- 各トピックについて、情報源の URL を明記する
- 確認できなかった情報は「確認できず」と正直に書く。推測で埋めない
- レポートは簡潔にまとめる。各セクション3〜8項目程度
- 追加の調査領域がpromptで指定された場合は、そのサブエージェントも追加起動する
