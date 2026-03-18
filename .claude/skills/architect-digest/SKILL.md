---
name: architect-digest
disable-model-invocation: true
description: |
  設計パターン・アーキテクチャ思想、Cloud Native / CNCF、Platform Engineering / SRE、
  クラウドベンダー・業界動向など、ソフトウェアアーキテクトが注視すべき直近1ヶ月の動向を
  サブエージェントで並行調査し、サマリレポートとして報告するスキル。
allowed-tools: WebSearch, WebFetch, Agent
---

# Architect Digest

ソフトウェアアーキテクトが注視すべき直近1ヶ月の動向を調査してレポートする。

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

### ステップ2: レポート作成

各サブエージェントの結果を統合し、以下のフォーマットでレポートを作成する。

```markdown
# Architect Digest（YYYY-MM-DD）

対象期間: YYYY-MM-DD 〜 YYYY-MM-DD

## 設計パターン・アーキテクチャ思想
### Martin Fowler blog
- ...
### InfoQ Architecture & Design
- ...
### ThoughtWorks Technology Radar
- ...
### DDD / CQRS / Event Sourcing
- ...

## Cloud Native / CNCF
### CNCF プロジェクト動向
- ...
### Kubernetes
- ...
### OpenTelemetry
- ...
### Service Mesh / eBPF
- ...

## Platform Engineering / SRE / Observability
### Platform Engineering
- ...
### IaC
- ...
### SRE プラクティス
- ...
### Observability
- ...

## クラウドベンダー・業界動向
### AWS
- ...
### GCP
- ...
### テック企業エンジニアリングブログ
- ...
### カンファレンス・論文
- ...

## 横断的な注目トピック
（複数領域にまたがるトレンドがあれば記載）
```

### ルール

- 各トピックについて、情報源の URL を明記する
- 確認できなかった情報は「確認できず」と正直に書く。推測で埋めない
- レポートは簡潔にまとめる。各セクション3〜8項目程度
- 追加の調査領域がpromptで指定された場合は、そのサブエージェントも追加起動する
