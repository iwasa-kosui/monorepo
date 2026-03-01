# 岩佐幸翠（Kosui Iwasa）

## プロフィール

| 項目 | 内容 |
|------|------|
| 氏名 | 岩佐 幸翠（いわさ こすい） |
| ハンドルネーム | kosui / ebiebievidence |
| 現職 | 株式会社カケハシ テックリード |
| 専門領域 | TypeScript, Platform Engineering, 認証認可基盤, 関数型プログラミング |
| 個人サイト | https://kosui.me/ |
| GitHub | [@iwasa-kosui](https://github.com/iwasa-kosui) |
| X (Twitter) | [@kosui_me](https://x.com/kosui_me)（旧: @ebiebievidence） |
| Google Scholar | [Kosui Iwasa](https://scholar.google.com/citations?user=DaujMhUAAAAJ&hl=ja) |
| Speaker Deck | [kakehashi](https://speakerdeck.com/kakehashi) |

---

## 学歴

### 東京農工大学（2013年〜2017年）

- **学部**: 工学部 情報工学科
- 学士（情報工学）取得

### 東京農工大学大学院（2017年〜2018年）

- **研究科**: 工学府（修士課程）
- **研究分野**: 人工知能、マルチエージェントシステム、自然言語処理

---

## 職歴

### マッチングッド株式会社（2014年11月〜2017年5月）

- **役職**: Webエンジニア
- **技術スタック**: PHP, MySQL, Smarty
- 学生時代からWebエンジニアとしてのキャリアをスタート

### 株式会社ドリコム（2017年10月〜2018年10月）

- **役職**: 機械学習エンジニア / Webエンジニア（アルバイト）
- **技術スタック**: Ruby, React, Drizzle, EC2, S3
- 大学院在学中に機械学習とWeb開発の両方に従事

### matsuri technologies株式会社（2018年10月〜2019年3月）

- **役職**: Webエンジニア（アルバイト）
- **技術スタック**: Go, React, Kotlin, EC2

### 株式会社ディー・エヌ・エー（DeNA）（2019年4月〜2023年4月）

- **役職**: Webエンジニア
- **在籍期間**: 約4年
- **担当プロダクト**: タクシー配車アプリ「MOV」（現: GO）のタクシー事業者向け業務管理システム
- **技術スタック**: Go, Vue.js, TypeScript, Google App Engine (GAE), Cloud SQL, Stackdriver, CircleCI

#### DeNA時代の主な成果

- タクシー配車プラットフォームのバックエンド開発に従事
- AWS ECS on Fargate + FireLens を活用した大規模ログ基盤の構築
  - 16KB以上のログ分割問題の解決策をDeNA Engineering Blogで技術記事として公開
- DeNA TechCon 2021 にて User-Agent 削減対策について登壇

### 株式会社カケハシ（2022年8月〜現在）

- **役職**: テックリード
- **所属**: 組織管理・認証認可プラットフォームチーム（2023年9月〜テックリード就任）
- **事業内容**: 薬局DXを推進し、日本の医療体験を変革するSaaSプロダクト群の開発

#### カケハシでの担当領域

- **認証認可基盤**: OpenID Connect / OAuth 2.0 に基づく認証フローの設計・実装。Authlete、AWS を活用した堅牢な認証プラットフォームの構築
- **ライセンスシステム**: マルチプロダクトSaaSにおけるライセンス管理基盤
- **組織階層フレームワーク**: 薬局チェーンなど複雑な組織構造に対応する階層管理システム
- **テナント分離**: PostgreSQL Row Level Security (RLS) を活用したマルチテナントアーキテクチャ
- **データパイプライン**: Delta Lake、Outbox パターンを用いたイベント駆動型データ基盤
- **信頼性向上**: インシデント調査時間を2〜3時間から30分に短縮する仕組みの構築

#### 技術的アプローチ

- サーバーサイドTypeScript / Node.js を主軸としたプラットフォーム開発
- 関数型プログラミングパターン（fp-ts、代数的データ型、Railway Oriented Programming）の実践的チーム導入
- Schema-Driven Development（Zodによるランタイム型検証とBranded Type）
- ドメイン駆動設計 + イベント駆動設計による Always-Valid Domain Model の実現
- 3省2ガイドラインに準拠した医療情報システムのセキュリティ設計

---

## 登壇歴

### 2026年

| 日付 | イベント | タイトル | 時間 |
|------|---------|---------|------|
| 2026/01/31 | **SRE KAIGI 2026** | 開発チームが信頼性向上のためにできること — 医療SaaS企業を支える共通基盤の挑戦 | 30min |

**SRE KAIGI 2026 概要**: 専任SREを持たない開発チームが、医療SaaSの信頼性をどう向上させるかをテーマに登壇。PostgreSQL RLS によるテナント分離、Delta Lake + Outbox パターンによるデータパイプライン、ドメインイベントによるトレーサビリティ確保、サービスベースアーキテクチャへの移行について解説。

### 2025年

| 日付 | イベント | タイトル | 時間 |
|------|---------|---------|------|
| 2025/06/14 | **関数型まつり 2025** | 堅牢な認証基盤の実現: TypeScriptで代数的データ型を活用する | 20min |

**関数型まつり 2025 概要**: OpenID Connect 認証フローの複雑な状態遷移を、代数的データ型（ADT）とステートマシン設計で型安全に表現する手法を紹介。状態と振る舞いの分離による不正な状態遷移の防止を解説。

### 2024年

| 日付 | イベント | タイトル | 時間 |
|------|---------|---------|------|
| 2024/10/30 | OAuth Study Group | プロダクト成長に対応するプラットフォーム戦略 | 20min |
| 2024/05/11 | **TSKaigi 2024** | 複雑なビジネスルールに挑む: 正確性と効率性を両立するfp-tsのチーム活用術 | 20min |
| 2024/03/26 | Findy Lunch LT | 品質とスピードを両立: TypeScriptの柔軟な型システムをバックエンドで活用する | 10min |

**TSKaigi 2024 概要**: Excel一括インポートにおける表形式データの検証で、fp-ts の `Either` 型と `Applicative Validation` を用いてすべてのエラーを同時に収集する手法を紹介。依存スキーマバリデーション（シート間参照）、Newtype によるブランド安全性、チームへのfp-tsオンボーディング戦略（ペアプログラミング、レシピ集）も解説。

### 2023年

| 日付 | イベント | タイトル | 時間 |
|------|---------|---------|------|
| 2023/12/06 | Findy Lunch LT | 更新"しない"ドキュメント管理 — イミュータブルドキュメントモデルの実運用 | 20min |
| 2023/10/24 | TechPlay パネルディスカッション | 大規模SaaSにおけるプラットフォームシステム開発の進め方 | 15min |

**TechPlay パネル概要**: SmartHR・リクルートとの合同パネルで、プラットフォームチームとプロダクトチームの期待値の不一致をどう解消するかを議論。

### 2021年

| 日付 | イベント | タイトル | 時間 |
|------|---------|---------|------|
| 2021/12/27 | DeNA TechCon 2021 | User-Agent削減対策 | 5min |

### 2019年

| 日付 | イベント | タイトル | 時間 |
|------|---------|---------|------|
| 2019/12/22 | MCCMMANCC 2019 | Goコンパイラ探索 | 15min |

---

## 技術記事・ブログ

### DeNA Engineering Blog

| 日付 | タイトル |
|------|---------|
| 2022/08/12 | [AWS ECS on Fargate + FireLens で大きなログが扱いやすくなった話](https://engineering.dena.com/blog/2022/08/firelens/) |

### 個人ブログ（kosui.me）

| 日付 | タイトル |
|------|---------|
| 2025/12/10 | [Node.jsパフォーマンスチューニングをDatadog APMとClaude Codeでサクッとやる](https://kosui.me/posts/2025/12/10/210415) |
| 2025/10/23 | [私がTypeScriptで `interface` よりも `type` を好む理由](https://kosui.me/posts/2025/10/23/214710) |
| 2025/06/02 | [ユーザーの内部IDの発行権を他人に握らせてはいけない](https://kosui.me/posts/2025/06/02/225249) |
| 2025/06/02 | [なぜTypeScriptでメソッド記法を避けるべきか？実務に近い事例の紹介](https://kosui.me/posts/2025/06/02/221656) |
| 2025/05/08 | [生成AIにMermaid.jsでロバストネス図を描いてもらう](https://kosui.me/posts/2025/05/08/011826) |
| 2025/05/06 | [TypeScriptでドメインイベントを容易に記録できるコード設計を考える](https://kosui.me/posts/2025/05/06/142842) |
| 2025/05/05 | [Union型から交差型への変換](https://kosui.me/posts/2025/05/05/113306) |

---

## 技術スタック

### 言語

- **TypeScript / JavaScript** — 現在の主力。サーバーサイド（Node.js）とフロントエンドの両方で使用
- **Go** — DeNA時代にバックエンド開発で使用
- **PHP** — 初期のキャリアで使用
- **Ruby** — ドリコム時代に使用
- **Kotlin** — matsuri technologies時代に使用

### フレームワーク・ライブラリ

- fp-ts, Zod, Drizzle ORM
- Vue.js, React, Astro
- Hono（推定: カケハシでの使用）

### インフラ・クラウド

- **AWS**: ECS (Fargate), RDS (PostgreSQL), Lambda, CloudFront, S3, Authlete
- **GCP**: Google App Engine, Cloud SQL, Stackdriver
- **その他**: Docker, CircleCI, Datadog APM, Delta Lake

### 設計思想・パターン

- ドメイン駆動設計（DDD）
- イベント駆動設計 / イベントソーシング
- Railway Oriented Programming（Result / ResultAsync）
- Schema-Driven Development（Zod + Branded Type）
- Always-Valid Domain Model
- CQRS / Outbox パターン
- マルチテナントアーキテクチャ（PostgreSQL RLS）

---

## 研究分野（大学院）

- 人工知能
- マルチエージェントシステム
- 自然言語処理

---

## キャリアの特徴

1. **学生時代からの実務経験**: 大学1年次（2014年）からWebエンジニアとして実務に携わり、修士課程と並行して複数社でエンジニアリング経験を積む
2. **DeNAでのモビリティ事業**: タクシー配車アプリ「MOV」（現: GO）の業務管理システム開発を通じて、大規模トラフィックとリアルタイム性が求められるシステムの構築経験を得る
3. **カケハシでのプラットフォームエンジニアリング**: 医療SaaS企業において、認証認可・ライセンス・組織管理といった横断的な共通基盤をテックリードとして設計・開発。3省2ガイドラインに準拠した高い信頼性が求められる環境で、TypeScriptと関数型プログラミングを武器に堅牢なシステムを構築
4. **関数型プログラミングの実践的導入**: fp-ts、代数的データ型、Railway Oriented Programming といった関数型の手法を、チーム全体で運用できるレベルまで落とし込み、TSKaigi や関数型まつりなどの主要カンファレンスで知見を共有
5. **継続的なアウトプット**: 技術ブログ、カンファレンス登壇、OSSコントリビューションを通じて、学んだ知見を積極的に発信
