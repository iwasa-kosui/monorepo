---
theme: ../../themes/kkhs
title: "社内向け再講演: 開発チームが信頼性向上のためにできること"
info: |
  SRE Kaigi 2026 社内向け再講演
  認証権限基盤チームの取り組み
author: 岩佐 幸翠
keywords: SRE, Architecture, Domain Events, RLS, Service-Based Architecture
transition: slide-left
duration: 20min
mdc: true

talk:
  date: "2026-04-09"
  event: "社内向け再講演"
  description: |
    SRE Kaigi 2026で発表した内容の社内向け再講演です。Embedded SRE不在でも開発チームが信頼性に責任を持ち、改善を続けるための具体的な方法論と、運用を通じて学んだ教訓を紹介します。
  tags:
    - SRE
    - アーキテクチャ
    - プラットフォーム
  duration: "20min"
  speaker: "岩佐 幸翠"
---

<div class="text-sm opacity-80 mb-16">社内向け再講演: SRE Kaigi 2026</div>

# 開発チームが<br/>信頼性向上のためにできること

認証権限基盤チームの取り組み

<div class="mt-16">
  <div class="text-lg">岩佐 幸翠</div>
</div>

<div class="absolute bottom-6 left-14 text-xs opacity-60">©KAKEHASHI inc.</div>

<!--
本日はSRE Kaigi 2026で発表した「開発チームが信頼性向上のためにできること」の社内向け再講演です。20分でお話しします。
-->

---
layout: center
class: text-center
---

# キーメッセージ

<MessageBox>

Embedded SRE不在でも<br/>開発チームが設計を"自分ごと"として<br/>運用し続けることで信頼性は向上できる

</MessageBox>

認証権限基盤チームが直面した困難と  
それを乗り越えた方法論を共有します

<!--
まず最初にキーメッセージです。Embedded SREがいなくても、開発チームが設計を「自分ごと」として運用し続ければ、信頼性は向上できます。
私たちのチームにはEmbedded SREがいません。しかし、開発チーム自身が信頼性に責任を持ち、設計を選び、運用し、改善を続けてきました。本日は20分で、その具体的な方法論と教訓をお伝えします。
-->

---

# 認証権限基盤チームと向き合っている領域

<div class="grid grid-cols-2 gap-6">
<div>

### 提供する基盤

<CardGrid cols="2">
  <Card title="認証基盤" />
  <Card title="ID基盤" />
  <Card title="ライセンス基盤" />
  <Card title="端末・証明書基盤" />
</CardGrid>

社内の**複数プロダクトから利用**される共通基盤  
止まると全プロダクトに影響

</div>
<div>

### 求められる品質

- **コンプライアンス**  
  3省2ガイドライン準拠 (監査ログ・BCP・二要素認証など)
- **高可用性**  
  夜間・休日も医療機関は稼働
- **トレーサビリティ**  
  データの真正性を証明できること
- **テナント分離**  
  患者情報を絶対に漏洩させない

</div>
</div>

Embedded SREは不在 — 開発チーム自身が**信頼性に責任を持つ**

<!--
認証権限基盤チームが向き合っている領域を簡単に紹介します。左側がチームの担当する4つの基盤で、社内の複数プロダクトから利用される共通基盤です。
右側が求められる品質です。3省2ガイドラインへの準拠、夜間休日も含めた高可用性、データの真正性を証明するトレーサビリティ、そして患者情報のテナント分離。これらを同時に満たす必要があります。
そしてEmbedded SREは不在のため、開発チーム自身が信頼性に責任を持っています。
-->

---

# 本日の構成

1. **課題** — 品質要求の相反・トレーサビリティ欠如
2. **方法論** — 2つのレイヤーと継続的改善プロセス
3. **結果と教訓** — 成果と学び
4. **まとめ** — 持ち帰りポイント

<!--
本日の流れです。課題から入り、方法論としてインフラレイヤとアプリケーションレイヤの2つのアプローチ、そして継続的改善プロセスについてお話しします。
-->

---
layout: section
---

# 1. 課題

品質要求の相反とトレーサビリティの欠如

---

# 課題①  トレーサビリティの欠如

### 既存システムの問題

一部の既存基盤では最新のデータだけを保存していた

- 例) 「3ヶ月前にこの証明書はどの端末に紐づいていたか?」  
  **アクセスログ**や**復元したDBバックアップ** から調査する必要があり、時間がかかる

### 医療システムでの重要性

過去のデータ状態を説明できることは、法的にもビジネス的にも極めて重要

### CSへのデータ提供

開発者のみならず、CSチームが顧客対応で過去データを調査するケースも多い  
CSが即座に問い合わせへ回答し顧客の信頼を維持できる必要がある

<!--
1つ目の課題はトレーサビリティの欠如です。既存の基盤では最新のデータだけを保存していました。
例えば「3ヶ月前にこの証明書はどの端末に紐づいていたか？」に答えるには、アクセスログやDBバックアップの復元が必要で、数時間かかりました。CSチームの顧客対応にも直結する問題でした。
-->

---

# 課題②  品質要求の相反

### 異なる品質要求を持つシステム間の依存

<div class="mb-4 flex gap-4">

<img src="/auth-id-dependency.svg" alt="認証基盤とID基盤の依存関係" width="400" />

<div>
例) 認証基盤はID基盤に依存する

- 認証基盤  
  **可用性**が重要
- ID基盤  
  整合性と**トレーサビリティ**が重要

</div>
</div>

- 生じる課題1: メンテナンス計画  
  例) **ID基盤** で整合性維持のため停止してデータ移行したいが
  **認証基盤** は停止できない

- 生じる課題2: 障害対応  
  例) **ID基盤** でデータ不整合が発生した場合、**認証基盤** を停止せざるを得ない

<!--
2つ目の課題は品質要求の相反です。認証基盤は可用性が最優先、ID基盤は整合性とトレーサビリティが最優先。品質要求が異なるシステムが密結合していることで、一方の改善が他方に悪影響を及ぼす状況でした。
-->

---
layout: section
---

# 2. 方法論

2つのレイヤーと継続的改善プロセス

---

# 信頼性を支える2つのレイヤーと継続的改善


<CardGrid :cols="2">
  <Card
    title="1. インフラレイヤ"
    description="テナント分離・データ連携"
  >
  </Card>
  <Card
    title="2. アプリケーションレイヤ"
    description="ドメインイベント・サービス分割"
  >
  </Card>
</CardGrid>

<div class="mt-4">
  <Card title="継続的改善プロセス" description="評価・計画・実行" />
</div>

<!--
方法論は2つの技術レイヤーと1つのプロセスで構成されています。インフラレイヤではテナント分離とデータ連携、アプリケーションレイヤではドメインイベントとサービス分割、そしてそれらを育て続ける継続的改善プロセスです。
-->

---
layout: section
---

# 2-1. インフラレイヤの設計

データの分離・永続化・配信

---

# テナント分離: RLS

### 課題

顧客Aが持つ患者データを顧客Bが絶対に参照できないようにしたい

<CardGrid :cols="3">
  <OptionCard title="アプリレベル" status="rejected" statusText="✗ 仕組みで防げない">
    <p>WHERE句でフィルタ</p>
    <p class="mt-2">SQLインジェクションやバグで漏洩</p>
  </OptionCard>
  <OptionCard title="スキーマ分離" status="rejected" statusText="✗ 管理コストが膨大">
    <p>テナントごとにスキーマ</p>
    <p class="mt-2">統廃合時の対応が困難</p>
  </OptionCard>
  <OptionCard title="行レベルセキュリティ" status="selected" statusText="✓ 採用">
    <span>(RLS)</span>
    <p>DBレベルで強制保護</p>
    <p class="mt-2">漏洩を仕組みで防止</p>
  </OptionCard>
</CardGrid>

<!--
テナント分離にはPostgreSQLのRLSを採用しました。アプリレベルのWHERE句は仕組みで防げない、スキーマ分離は統廃合時の管理コストが膨大。RLSならDBレベルで強制的に分離でき、アプリにバグがあっても漏洩しません。
-->

---

# RLSの実装

<div class="grid grid-cols-[350px_1fr] gap-6 mt-4">

<div>

### PostgreSQL側

```sql
-- RLSポリシーの定義
CREATE POLICY tenant_isolation ON users
  USING (tenant_id =
    current_setting('app.tenant_id')::uuid);

-- RLSを有効化
ALTER TABLE users
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE users
  FORCE ROW LEVEL SECURITY;

-- 重要: tenant_idにインデックス
CREATE INDEX idx_users_tenant_id
  ON users(tenant_id);
```

</div>

<div>

### アプリケーション側

```typescript
// ミドルウェアでトランザクションを開始し
// テナントIDをセッション変数に設定
const tenantMiddleware = createMiddleware(
  async (c, next) => {
    const tenantId = extractTenantId(c);
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, false)`;
      );
      c.set("tx", tx);
      await next();
    });
  }
);

// うっかりWHERE句を忘れてもRLSが働く
const users = await c.get("tx").select()
  .from(usersTable);
```

</div>

</div>

<!--
RLSの実装です。PostgreSQL側でRLSポリシーを定義し、アプリ側のミドルウェアでテナントIDをセッション変数にセットします。以降のクエリはすべてRLSが自動適用され、WHERE句を忘れても安全です。
-->

---

# RLS: 運用と改善

### 複数ポリシーの運用

ポリシーを複数定義することは可能だが、一つのトランザクションに複数のポリシーが誤って適用されるリスクに注意

### パフォーマンス

- 想定通りにインデックスが機能しているか確認
- 検索キーとRLS条件の組み合わせを考慮したインデックス設計

### 新規テーブルへの適用

自動テストでRLS適用漏れを検知する

- 例) `pg_policy` テーブルを参照し、RLS未適用テーブルを検出

<!--
RLS運用のポイントです。複数ポリシーの管理、パフォーマンスのためのインデックス設計、そしてpg_policyを使った適用漏れの自動検知テストが重要です。
-->

---

# データ連携パターン比較

基盤とプロダクト間のデータ連携には3つのパターンがある

限られた人員数と高い信頼性要求を満たすためにデータ基盤連携を第一選択肢とした

<div class="mt-4">

| パターン | 即時性 | 耐障害性 | 一貫性 | ユースケース |
|----------|:------:|:--------:|:------:|-------------|
| **データ基盤連携** | △ | ◎ | ◎ | 定期的に一貫性の<br/>あるデータを取得 |
| **API連携** | ◎ | △ | ◎ | リアルタイムで<br/>データ取得が必要 |
| **イベント連携** | ○ | ○ | ○ | 変更をトリガーに非同期処理 |

</div>

<!--
データ連携は3パターンを検討し、データ基盤連携を第一選択肢としました。基盤障害時にプロダクト側への影響を最小化できるためです。
-->

---

# データ基盤連携: Delta Lake + タイムトラベル

<div class="grid grid-cols-2 gap-6 mt-4">

<div>

### アーキテクチャ

<img src="/data-pipeline.svg?3" class="mx-auto h-[350px]" />

</div>

<div>

### タイムトラベル機能

Delta LakeやApache Icebergなど
モダンなデータレイクでは
過去のデータ状態に即座にアクセス可能

```python
# 現在のデータ
df = spark.read.format("delta")
    .load("s3://bucket/users")

# 3ヶ月前の状態
df_past = spark.read.format("delta") \
    .option("timestampAsOf", "2025-10-01") \
    .load("s3://bucket/users")
```

<OptionCard status="selected">

DBバックアップを復元せずに
過去データを即座に調査可能に

</OptionCard>

</div>

</div>

<!--
Delta Lakeのタイムトラベル機能で、過去の任意の時点のデータに即座にアクセスできます。DBバックアップの復元なしに過去データを調査できるようになりました。
-->

---

# データ連携: 運用と改善

<CardGrid :cols="1">

<div>

### 運用で直面した課題

<InsightCard title="「即時性が必要」の誘惑">
  <p>プロダクトチームから「リアルタイムで欲しい」→ 本当に必要か？を一緒に検討<br><span class="highlight">多くは「数分遅延OK」</span>であり、むしろ可用性と一貫性の方が重要なケースがほとんど</p>
</InsightCard>

<InsightCard title="障害発生時のリスク管理">

- 基盤側に障害が生じた場合のリスクをプロダクトチームと整理し  
  **事前に役割や対応手順を合意しておく**ことが重要
- 障害発生時のリスクが大きいデータは  
  **データパイプライン上で** 重点的に **データバリデーション** する

</InsightCard>

</div>

</CardGrid>

<!--
運用での気づきです。「リアルタイムで欲しい」と言われても、深掘りすると数分遅延OKなケースがほとんどでした。また、障害時の対応手順を事前にプロダクトチームと合意しておくことが重要です。
-->

---
layout: section
---

# 2-2. アプリケーションレイヤの設計

ドメインイベントとサービス分割

---

# ドメインイベント

### ドメインイベントとは

過去に発生した出来事を表したもの

> ドメインイベントはドメインモデルの正式な構成要素であり、  
> ドメイン内で起こった何かを表現するものである
>
> — Eric Evans

### 認証権限基盤での具体例

- `UserCreated`（ユーザー作成）
- `RoleAssigned`（ロール付与）
- `PermissionRevoked`（権限剥奪）

<!--
ドメインイベントとは、システム内で過去に発生した出来事の記録です。UserCreated、RoleAssigned、PermissionRevokedなど、すべて過去形で「起きた事実」を記録します。
-->

---

# ドメインイベントを記録する意義

### CQRS? イベントソーシング?

イベント駆動アーキテクチャやCQRSの文脈でよく語られる

### それだけではない

出来事が**すべて記録される**こと自体に価値がある


- 障害調査: 過去の状態を再現し、原因特定が容易に
- 監査: 監査ログを完全に追跡可能
- 動向分析: ユーザー行動の時系列分析


<!--
CQRSやイベントソーシングを導入しなくても、イベントを記録するだけで大きな価値があります。障害調査、監査対応、動向分析のすべてで効果を発揮します。
-->

---

# ドメインイベントの保存と検索

<div class="grid grid-cols-[500px_1fr] gap-4">

<div>

### ドメインイベントの保存

変更後の状態も一緒に保存する  
「状態テーブル」を更新しつつ「イベントテーブル」にINSERT

```typescript
// 例: ユーザー作成を実行するときUserCreatedイベントを生成
const updateUsername =
  (user: User, username: string): UserCreatedEvent => ({
    kind:        "User",
    aggregateId: user.id,
    state:       { ...user, username },              // 変更後の状態
    eventAt:     Date.now(),                         // 変更日時
    eventName:   "UsernameUpdated",                  // イベント名
    payload:     { performedBy: "system", username } // イベント詳細
  });
```

</div>

<div>

### ドメインイベントの検索

「イベントテーブル」を検索するだけで  
ユーザーへの過去の操作をすぐ確認できる

```sql
-- あるユーザーの状態の履歴を全件取得
SELECT * FROM domain_event
  WHERE
    `kind` = 'User'
    AND `aggregate`.id = '123e...'
  ORDER BY
    eventAt ASC;
```

</div>

</div>

<br/>

### **イベントのリプレイなし**でも過去の状態を即座に参照可能

<!--
変更後の状態もイベントと一緒に保存することで、リプレイなしに任意の時点の状態を即座に参照できます。
-->

---

# 既存システムへの導入戦略

**稼働中のID基盤** にドメインイベントを導入し過去のユーザーの状態を追跡可能にしたい

<CardGrid :cols="2">
  <OptionCard title="フルリプレイス" status="rejected" statusText="✗ リスクが高い">
    <p>全機能を一斉に移行</p>
    <p class="mt-2">ダウンタイム・バグリスクが大</p>
  </OptionCard>
  <OptionCard title="段階的導入" status="selected" statusText="✓ 採用">
    <p>既存データからイベントを生成</p>
    <p class="mt-2">リスクを最小化しながら移行</p>
  </OptionCard>
</CardGrid>

<div class="mt-4 p-4 bg-brand-50 rounded-lg">
  <h4 class="font-bold mb-2">戦略: スナップショット→イベント変換</h4>
  <ul class="text-sm space-y-1">
    <li>既存DBの<span class="font-bold">スナップショット</span>から初期イベントを生成</li>
    <li>新規書き込みは<span class="font-bold">即座にイベント化</span></li>
  </ul>
</div>

<!--
稼働中のシステムへの導入は段階的に行いました。既存DBのスナップショットから初期イベントを生成し、新規書き込みは即座にイベント化します。Delta Lakeのタイムトラベル機能がこの戦略を支えています。
-->

---

<!--
スナップショットからイベントを生成するステップです。CDCログの蓄積を開始し、スナップショット間の差分からイベントを生成、新規書き込みはアプリ側で即座にイベント化します。状態テーブルとイベントテーブルを同じDB内に保持し、トランザクションによる一貫性を保証しています。
-->

# スナップショットからイベントを生成

<div class="grid grid-cols-[420px_1fr] gap-6 mt-4">

<div>

### アーキテクチャ

<img src="/snapshot-to-event.svg?4" />

</div>

<div>

### 導入ステップ

1. 初期フェーズ  
    データ基盤へのCDC蓄積を開始
1. 差分検出  
    CDCログから差分を検出し既存イベント生成
1. 新規書き込み対応  
    アプリで新規書き込みを即座にイベント化

### データ基盤の2つのDelta Lake

- **CDCログ**: 状態テーブルの変更履歴を蓄積
- **ドメインイベント**: 既存/新規イベントを蓄積

</div>
</div>

---

# ドメインイベント: 運用と結果

<CardGrid :cols="2">

<div>

### 運用で得た気づき

<InsightCard title="イベント設計の見直し">
  <p>運用中に「この情報も必要だ」と気づく<br><span class="highlight">→ イベントのバージョン管理が重要</span></p>
</InsightCard>

<InsightCard title="運用負荷の最適化">

集約やイベントごとにテーブルを分割していた<br/>
→ 必要になるまで単一のテーブルに寄せて良い

</InsightCard>

</div>

<div>

### 得られた成果

<InsightCard title="障害調査での活用" variant="positive">
  <p>「このユーザーはいつ名前を変えた？」<br>→ イベントを辿って即座に回答可能に</p>
</InsightCard>

<InsightCard title="監査対応の効率化" variant="positive">
  <p>変更履歴の完全な追跡が可能になり、監査対応の工数が大幅に削減</p>
</InsightCard>

</div>

</CardGrid>

<!--
運用での気づきと成果です。イベント設計は一度決めたら終わりではなく、バージョン管理が重要。テーブル分割も必要になるまでは単一テーブルでよいという判断をしました。成果として、障害調査と監査対応の工数が大幅に改善されました。
-->

---

# サービスベースアーキテクチャの採用

品質要求が異なる認証基盤・ID基盤の**独立性を高めたい**が、  
**強いデータ整合性**も維持したい

<div class="flex gap-4 mb-2">

<img src="/service-based-architecture.svg" class="w-[500px] mt-2" />

<div class="mt-3 text-sm">

単一の**共有DB**を持ちながら、  
サービスは**独立してデプロイ**できる  
アーキテクチャ

- システム間でのAPI通信は禁止
- システム間でDBの読み取りを許可
- ただし各テーブルは  
  特定のサービスが所有し  
  他のサービスによる書込は禁止

マイクロサービスやイベント駆動と比較して  
**分散トランザクションの複雑さを回避**しつつ  
**デプロイの独立性を確保**

</div>

</div>

<!--
私たちが採用したのがサービスベースアーキテクチャです。マイクロサービスは誤った境界での分割リスクと分散トランザクションの複雑さ、イベント駆動は結果整合性が前提でBroker障害のリスク、モジュラモノリスは独立デプロイが困難。サービスベースアーキテクチャは単一DBで強い整合性を保ちながら、サービスごとの独立デプロイを実現できます。
-->

---

# サービスベースアーキテクチャの実装

<div class="grid grid-cols-2 gap-6 mt-4">

<div>

### 共有DBと論理的分離

<img src="/shared-db-schemas.svg" class="w-full" />

</div>

<div>

### DBユーザーによる権限制御

```sql
-- 認証サービス用
CREATE ROLE auth_service;
GRANT ALL ON auth.* TO auth_service;
GRANT SELECT ON directory.* TO auth_service;

-- ディレクトリサービス用
CREATE ROLE directory_service;
GRANT ALL ON directory.* TO directory_service;
GRANT SELECT ON auth.*, asset.*
  TO directory_service;
```

<div class="mt-4 p-3 bg-slate-100 rounded text-sm">
  <span class="font-bold">原則:</span><br>
  自分のスキーマにのみ書き込み権限<br>
  他のスキーマは読み取りのみ
</div>

</div>

</div>

<!--
実装では、単一PostgreSQL内にauth、directory、assetの3つのスキーマを配置。DBユーザーの権限でスキーマの所有権を強制しています。RLSと同様「仕組みで防ぐ」思想です。
-->

---

# サービスベースアーキテクチャの課題

<div class="grid grid-cols-2 gap-8 mt-4">

<div>

### 参照可否の区別

サービスが拡大するにつれ、テーブルの区別が困難に

<div class="p-3 bg-red-50 rounded mt-2 mb-3">
  <ul class="text-sm space-y-1">
    <li>他サービスから参照して<span class="font-bold">良い</span>テーブル</li>
    <li>他サービスから参照<span class="font-bold">しないでほしい</span>テーブル</li>
  </ul>
</div>

<div class="p-3 bg-brand-50 rounded">
  <p class="text-sm font-bold mb-1">対策</p>
  <ul class="text-sm space-y-1">
    <li>命名規則やスキーマで<span class="font-bold">公開/非公開</span>を区別</li>
    <li>チーム間でルールを明文化</li>
  </ul>
</div>

</div>

<div>

### スキーマ変更の制約

他サービスが参照するテーブルは容易に変更できない

<div class="p-3 bg-red-50 rounded mt-2 mb-3">
  <ul class="text-sm space-y-1">
    <li>カラム追加・変更時に<span class="font-bold">影響範囲</span>の調査が必要</li>
    <li>参照元サービスとの<span class="font-bold">デプロイ順序</span>の調整</li>
  </ul>
</div>

<div class="p-3 bg-brand-50 rounded">
  <p class="text-sm font-bold mb-1">対策</p>
  <ul class="text-sm space-y-1">
    <li>公開テーブルは<span class="font-bold">慎重に設計</span></li>
    <li>デプロイの柔軟性については<span class="font-bold">課題が残る</span></li>
  </ul>
</div>

</div>

</div>

<!--
課題もあります。参照可否の区別が曖昧になる問題と、公開テーブルのスキーマ変更が難しい問題です。銀の弾丸はなく、トレードオフの上で選んだ設計です。
-->

---
layout: section
---

# 2-3. 継続的改善プロセス

設計を「選んで終わり」にしない仕組み

---

# 設計を育て続ける仕組み

<CardGrid :cols="2">

<div>

### 判断の土台を作る

<InsightCard title="品質特性の明文化" variant="positive">
  <p>可用性・整合性・セキュリティなど<br>自チームに求められる品質特性を言語化し<br><span class="highlight">チーム全員で合意する</span></p>
</InsightCard>

<InsightCard title="ADRで意思決定を記録" variant="positive">
  <p>技術選択の背景・トレードオフ・却下案を記録<br><span class="highlight">新メンバーも同じ判断ができるように</span></p>
</InsightCard>

</div>

<div>

### 改善をロードマップに接続する

<InsightCard title="ポストモーテム → 改善プラン" variant="positive">
  <p>障害の顧客影響を評価し<br>実現可能な改善プランを策定<br><span class="highlight">改善プランをロードマップに反映</span></p>
</InsightCard>

<InsightCard title="PMへの説明責任" variant="positive">
  <p>「いつまでに未解決だと困る」を<br>ロードマップと照らし合わせて議論</p>
</InsightCard>

</div>

</CardGrid>

> [!IMPORTANT]
> **判断の「軸」と「記録」があり、改善がロードマップに反映されることで、設計を育て続けられる**

<!--
技術だけでは足りません。品質特性の明文化とADRで判断の土台を作り、ポストモーテムからの改善プランをロードマップに反映することで、設計を育て続けています。
-->

---
layout: section
---

# 3. 結果と教訓

「責任を果たす」とは何か

---

# 成果

<div class="mt-4">

<div class="grid grid-cols-2 gap-6">

<div>

| 項目 | Before | After |
|------|--------|-------|
| 障害時の原因特定 | 2〜3時間 | 30分以内 |
| 過去データの追跡 | 不可能 | 任意の時点で可能 |
| テナント分離 | アプリ依存 | DB保証 |
| 新規プロダクト認証 | 各チームで実装 | 共通基盤を利用 |

</div>

<div>

### プロダクトチームへの貢献

<div class="p-4 bg-slate-100 rounded-lg">
  <p class="text-sm">
    認証・認可基盤の共通化により、<br>
    <span class="font-bold">3省2ガイドラインを各チームが個別に解釈する必要がなくなった</span>
  </p>
</div>

### 「責任を果たす」サイクル

<div class="p-4 bg-brand-50 rounded-lg mt-4">
  <p class="text-sm">
    設計 → 運用 → 監視 → 改善 のサイクルを<br>
    開発チームが自走できる状態 = <span class="font-bold">責任を果たしている状態</span>
  </p>
</div>

</div>

</div>

</div>

<!--
成果です。障害時の原因特定は2〜3時間から30分以内に短縮。過去データの追跡が可能になり、テナント分離はDB保証に。プロダクトチームも3省2ガイドラインの個別解釈が不要になりました。設計→運用→監視→改善のサイクルを自走できている状態が「責任を果たしている状態」です。
-->

---
layout: section
---

# 4. まとめ

---

# 開発チームができること

<CardGrid :cols="2">
  <SummaryCard :number="1" title="ドメインイベント" description="「何が起きたか」を完全に記録" subdescription="障害調査・監査対応・データ復旧" />
  <SummaryCard :number="2" title="データ連携パターン" description="基盤障害を波及させない設計" subdescription="デフォルトはデータ基盤経由" />
  <SummaryCard :number="3" title="サービスベースアーキテクチャ" description="強い整合性と独立デプロイの両立" subdescription="サービス間通信を原則禁止" />
  <SummaryCard :number="4" title="RLS" description="DBレベルでテナントを強制分離" subdescription="バグがあっても漏洩しない" />
</CardGrid>

> [!NOTE]
> **設計パターンは「選ぶ」ものではなく「育てる」もの**

<!--
持ち帰りポイントです。ドメインイベント、データ連携パターン、サービスベースアーキテクチャ、RLS。これらを選ぶだけでなく、チームで意図を共有し運用しながら育て続けることが本質です。
基盤を利用しているプロダクトチームの皆さんには、これらの設計意図を理解いただき、連携についてご不明点があればお気軽にご相談ください。ありがとうございました。
-->
