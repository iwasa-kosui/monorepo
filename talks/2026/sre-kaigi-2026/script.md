# トークスクリプト：候補2（技術深堀り型）

**タイトル**: 開発チームが信頼性向上のためにできること: 医療SaaS企業を支える共通基盤の挑戦

**時間配分**: 導入(2分) → 設計原則(5分) → 技術選定(15分) → トレードオフ(6分) → まとめ(2分)

---

## 1. 導入とコンテキスト (2分)

### スライド1: タイトルスライド

みなさん、こんにちは。株式会社カケハシの岩佐と申します。本日は「開発チームが信頼性向上のためにできること」というテーマで、私たちが医療SaaS企業の共通基盤を構築する中で学んだアーキテクチャ設計の実践についてお話しします。

### スライド2: 医療SaaSの特殊性

まず、私たちが置かれているコンテキストについて簡単にご説明します。

カケハシは薬局向けのSaaSを4つ以上開発・運用しており、その全てが医療情報システムとして患者情報を扱っています。ここで重要なのは、医療分野特有の制約です。

**セキュリティ要件**: 3省2ガイドラインでは、多要素認証の必須化、監査ログの長期保存、厳格なパスワードポリシーが求められます。

**可用性要件**: 医療機関は24時間365日稼働しているため、システム停止は患者の安全に直結します。

**データ整合性**: 患者情報や処方データは、一瞬たりとも不整合が許されません。

**組織の柔軟性**: 薬局業界では統廃合が頻繁に発生するため、テナント分離と組織管理の両立が必要です。

### スライド3: 本セッションのスコープ

本日は、このような厳しい要件の中で、SREという専門チームを持たない私たち開発チームが、どのようにアーキテクチャレベルで信頼性を確保してきたか、その技術選定の思考プロセスと実装パターンをお伝えします。

特に、以下の3つの層に分けて解説します：
- インフラレイヤ: データの永続化と配信
- アプリケーションレイヤ: 整合性とトレーサビリティ
- 統合レイヤ: システム間の連携

---

## 2. 設計の4大原則 (5分)

### スライド4: 設計原則の全体像

技術選定の前に、私たちが定めた4つの設計原則についてお話しします。これらは全ての技術判断の基準となりました。

### スライド5: 原則1 - 基盤障害を波及させない疎結合

**原則**: 共通基盤の障害が、全プロダクトの停止を引き起こしてはならない

医療現場では、一つのシステムが止まっても、他のシステムは動き続ける必要があります。例えば、認証基盤が一時的にダウンしても、既にログインしているユーザーは業務を継続できるべきです。

このため、私たちは以下のアプローチを取りました：
- リアルタイム同期ではなく、耐障害性の高いストレージ（S3）を介したデータ配信
- API連携ではなく、データ基盤経由でのバッチ連携を優先
- ただし、認証のようにリアルタイム性が必要な領域では、高可用性のインフラ（DynamoDB）を採用

### スライド6: 原則2 - データの整合性と可用性の両立

**原則**: 高可用性を実現しながら、データの整合性・一貫性を担保する

これは一見矛盾する要求に見えますが、データの性質によって戦略を分けることで解決しました：

- **頻繁に変更されるデータ**（セッション情報、ログイン履歴）
  → DynamoDB + Outboxパターンで高可用性を優先
  
- **頻繁に変更されないデータ**（ユーザー、店舗、組織情報）
  → PostgreSQL + Delta Lakeで整合性を優先

この使い分けが、後ほど説明する技術選定の基盤となります。

### スライド7: 原則3 - 完全なトレーサビリティ

**原則**: 過去のあらゆる時点の状態を再現可能にする

医療業界では、「3ヶ月前のこの患者のデータがどうだったか」を説明できることが、法的にもビジネス的にも極めて重要です。

既存システムでは最新データしか保存されておらず、障害時の原因調査が困難でした。新システムでは、以下を実現しました：

- ドメインイベントとして全ての変更を記録
- Delta Lakeのタイムトラベル機能で過去のスナップショットにアクセス
- イベントのリプレイによる状態の再構築

### スライド8: 原則4 - プロダクトチームの認知負荷軽減

**原則**: プロダクトチームが本質的な価値提供に集中できるようにする

共通基盤の目的は、プロダクトチームから複雑性を隠蔽することです。

- OpenID Connectの標準仕様を最大限活用し、認証基盤の複雑さを隠蔽
- データ基盤経由でクリーンなデータモデルを提供
- プロダクト固有の要件は、標準的なパラメータで表現

このため、各プロダクトチームは3省2ガイドラインを個別に解釈する必要がなくなりました。

---

## 3. 技術選定の深掘り (15分)

ここから、具体的な技術選定とその実装パターンについて、5つの層に分けて詳しく解説します。

### スライド9: 技術スタック全体像

[アーキテクチャ図を表示]

### 3-1. セキュリティ層: PostgreSQL RLSによるマルチテナント分離 (3分)

#### スライド10: RLSの選択理由

**課題**: 顧客Aのデータを顧客Bが絶対に参照・変更できないようにする必要がある

**選択肢の検討**:
1. アプリケーションレベルでのフィルタリング → 実装ミスのリスクが高い
2. スキーマ分離 → 管理コストが膨大
3. 行レベルセキュリティ（RLS） → データベースレベルで強制的に保護

私たちはRLSを選択しました。理由は以下の通りです：

**メリット**:
- SQLインジェクションやアプリケーションバグがあっても、他テナントのデータは漏洩しない
- ポリシーはテーブル定義と一緒に管理できる
- 既存のクエリを変更する必要がない

#### スライド11: RLSの実装パターン

```sql
-- テナントコンテキストの設定
SET app.current_tenant_id = 'tenant_123';

-- RLSポリシーの定義
CREATE POLICY tenant_isolation_policy ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

**重要な実装ポイント**:
1. 接続プールごとに`SET app.current_tenant_id`を実行
2. トランザクション開始時に必ず設定を確認
3. 管理者用の特別なロールは、RLSをバイパスできるようにする

#### スライド12: RLSの落とし穴

**教訓1: マイグレーションの危険性**

誤ったポリシーを適用すると、データ漏洩や欠損が発生します。私たちは以下の手順を踏みました：

1. まず、ENFORCEではなくPERMISSIVEモードでポリシーを適用
2. 全てのクエリをログに記録し、意図しないアクセスがないか確認
3. 問題がないことを確認してからENFORCEモードに移行

**教訓2: パフォーマンスへの影響**

RLSポリシーは全てのクエリに適用されるため、適切なインデックスが重要です。

```sql
-- tenant_idにインデックスを必ず作成
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
```

### 3-2. 可用性層: DynamoDB + Outboxパターン (3分)

#### スライド13: DynamoDBの選択理由

**課題**: 認証セッション情報は、高い可用性と障害時の復旧容易性が必要

**なぜDynamoDBか**:
- マネージドサービスで運用負荷が低い
- 99.99%の可用性SLA
- オートスケーリングで突発的な負荷に対応
- リージョン間レプリケーションが容易

**使用ケース**:
- セッション情報（一時的なデータ）
- ログイン履歴（書き込み頻度が高い）
- 認証フロー状態（短命なデータ）

#### スライド14: Outboxパターンの実装

**課題**: DynamoDBのデータ変更を他プロダクトに配信したい

従来のアプローチ（アプリケーションから直接イベントバスに送信）には、以下の問題がありました：
- DynamoDBへの書き込みは成功したが、イベント送信に失敗
- 二重送信の可能性

**Outboxパターンによる解決**:

```typescript
// 1. DynamoDBのトランザクションで、本データとOutboxテーブルに書き込み
await dynamodb.transactWriteItems({
  TransactItems: [
    { Put: { TableName: 'sessions', Item: sessionData } },
    { Put: { TableName: 'outbox', Item: outboxEvent } }
  ]
});

// 2. 別プロセスがOutboxテーブルをポーリング
const events = await dynamodb.query({ TableName: 'outbox', ... });

// 3. イベントバスに送信後、Outboxから削除
await eventBridge.putEvents({ Entries: events });
await dynamodb.deleteItem({ TableName: 'outbox', Key: eventId });
```

**ポイント**:
- DynamoDB Streamsを使えば、リアルタイム性が向上
- 冪等性を保証するため、イベントIDを含める
- 最低1回配信（At-least-once delivery）を保証

### 3-3. データ配信層: Delta Lake + タイムトラベル (3分)

#### スライド15: Delta Lakeの選択理由

**課題**: 顧客データ（ユーザー、店舗、組織）を耐障害性高く、かつ履歴付きで配信したい

**なぜDelta Lakeか**:
- Parquet形式でS3に保存（99.999999999%の耐久性）
- ACIDトランザクションをサポート
- タイムトラベル機能で過去の状態にアクセス可能
- Databricksなど、多様なツールから読み取り可能

#### スライド16: データ配信フロー

```
PostgreSQL (RLS有効)
    ↓
  CDC (Change Data Capture)
    ↓
  Lambda / Glue
    ↓
Delta Lake (S3)
    ↓
  Databricks / Athena
    ↓
  各プロダクトのデータウェアハウス
```

**重要なポイント**:
1. PostgreSQLからのCDCは、論理レプリケーションスロットを使用
2. Delta Lakeへの書き込みは、日次 or 時間次でパーティション
3. 各プロダクトは、必要なテーブルのみをサブスクライブ

#### スライド17: タイムトラベルの威力

```python
# 現在のデータを取得
df = spark.read.format("delta").load("s3://bucket/users")

# 3ヶ月前の状態を取得
df_past = spark.read.format("delta") \
    .option("timestampAsOf", "2025-10-01") \
    .load("s3://bucket/users")

# 特定バージョンを取得
df_v100 = spark.read.format("delta") \
    .option("versionAsOf", 100) \
    .load("s3://bucket/users")
```

**ユースケース**:
- 障害調査：「3ヶ月前、このユーザーの所属店舗は何だったか？」
- 監査対応：「過去1年間で、この組織の権限変更履歴を全て抽出」
- データ復旧：「誤った一括更新の前の状態に戻したい」

### 3-4. アプリケーション層: ドメインイベント永続化 (3分)

#### スライド18: イベントソーシングの導入

**課題**: 最新データだけでなく、「いつ、誰が、何を変更したか」を完全に記録したい

**ドメインイベントの設計**:

```typescript
type DomainEvent<
  TAggregateKind extends string,
  TAggregateId,
  TAggregate,
  TEventName extends string,
  TEventPayload
> = {
  aggregateKind: TAggregateKind;
  aggregateId: TAggregateId;
  aggregate: TAggregate;  // 変更後の状態
  eventId: EventId;
  eventName: TEventName;
  eventPayload: TEventPayload;  // イベント固有のデータ
  eventAt: UnixTime;
};

// 使用例
type UserCreated = DomainEvent<
  'User',
  UserId,
  User,
  'UserCreated',
  { createdBy: UserId }
>;
```

#### スライド19: イベントストアの実装

**ストレージ戦略**:
1. PostgreSQLのeventsテーブルに永続化
2. パーティショニングで検索性能を維持
3. 古いイベントはS3にアーカイブ

```sql
CREATE TABLE events (
  event_id UUID PRIMARY KEY,
  aggregate_kind TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  aggregate_snapshot JSONB NOT NULL,
  event_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (event_at);

-- 月次パーティション
CREATE TABLE events_2025_10 PARTITION OF events
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
```

#### スライド20: スナップショットからのイベント生成

**課題**: 既存システムには履歴がなく、最新データしかない

**アプローチ**:
1. Delta Lakeの履歴から変更差分を検出
2. 差分から遡及的にドメインイベントを生成
3. 生成したイベントをイベントストアに投入

```python
# Delta Lakeの履歴を取得
history = spark.sql("""
  SELECT * FROM delta.`s3://bucket/users`.history()
  ORDER BY version
""")

# 各バージョン間の差分を計算
for i in range(len(history) - 1):
    df_old = read_version(i)
    df_new = read_version(i + 1)
    
    changes = detect_changes(df_old, df_new)
    events = generate_events_from_changes(changes)
    
    store_events(events)
```

**注意点**:
- イベント生成の順序が重要（依存関係を考慮）
- 一貫性を保つため、トランザクション内で実施
- 生成されたイベントには`isReconstructed: true`フラグを付与

### 3-5. 統合層: サービスベースアーキテクチャ (3分)

#### スライド21: なぜマイクロサービスではないのか

**検討したアーキテクチャ**:
1. モノリス → スケーラビリティの問題
2. マイクロサービス → 分散トランザクション、データ整合性の問題
3. サービスベースアーキテクチャ → 適度な分離と整合性のバランス

**サービスベースアーキテクチャを選んだ理由**:
- ユーザー、店舗、組織、ライセンスは強く関連している
- これらを別々のDBに分けると、整合性の担保が困難
- 単一のPostgreSQLを共有し、トランザクションで整合性を保証

#### スライド22: サービス間の結合度管理

**原則**: サービス間通信を原則禁止

```typescript
// ❌ BAD: サービスAがサービスBのAPIを呼ぶ
const user = await userService.getUser(userId);
const org = await orgService.getOrg(user.orgId);  // サービス間通信

// ✅ GOOD: 読み取り専用DBユーザーで直接参照
const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
const org = await db.query('SELECT * FROM orgs WHERE id = $1', [user.orgId]);
```

**実装ルール**:
1. 各サービスは自分のテーブルにのみ書き込み権限を持つ
2. 他のテーブルは読み取り専用ユーザーで参照
3. 外部キー制約でデータ整合性を保証

```sql
-- userサービス用のDBユーザー
CREATE ROLE user_service_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO user_service_writer;
GRANT SELECT ON orgs, licenses TO user_service_writer;  -- 読み取りのみ

-- orgサービス用のDBユーザー
CREATE ROLE org_service_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON orgs TO org_service_writer;
GRANT SELECT ON users, licenses TO org_service_writer;
```

#### スライド23: 共通ライブラリの危険性

**教訓**: 安易に共通ライブラリを作ると、サービス間の結合度が上がる

**失敗例**:
```typescript
// 共通ライブラリに業務ロジックを含めてしまった
// @shared/user-utils
export function canAccessOrg(user: User, org: Org): boolean {
  return user.orgId === org.id || user.role === 'ADMIN';
}

// → このライブラリを更新すると、全サービスが影響を受ける
```

**改善策**:
- 共通ライブラリは、純粋なユーティリティ（型定義、バリデーション）のみ
- ビジネスロジックは各サービスに配置
- どうしても共有が必要なら、明示的なバージョニングと段階的ロールアウト

---

## 4. 避けられないトレードオフ (6分)

### スライド24: トレードオフの全体像

どんな設計にも、トレードオフは存在します。ここでは、私たちが直面した4つの主要なトレードオフと、その対処法を共有します。

### スライド25: トレードオフ1 - 即時性 vs 耐障害性

**ジレンマ**:
- Delta Lake経由のデータ配信は耐障害性が高いが、反映に数時間かかる
- リアルタイムAPI連携は即座に反映されるが、基盤障害がプロダクトに波及

**私たちの選択**:
- デフォルトはDelta Lake経由（耐障害性を優先）
- どうしても即時性が必要な場合のみ、イベント駆動アーキテクチャを追加

**判断基準**:
```
即時性が必要 = 
  (ユーザーが変更を即座に確認する必要がある)
  AND
  (変更頻度が高い)
  AND
  (遅延がビジネスに直接影響する)
```

**例**:
- ユーザー作成 → 即時性不要（翌日反映で問題ない）
- ログイン履歴 → 即時性必要（監査ログとして即座に記録）
- 組織変更 → 即時性不要（計画的な変更が多い）

### スライド26: トレードオフ2 - RLSのパフォーマンス

**問題**: RLSポリシーは全てのクエリに適用されるため、パフォーマンスへの影響がある

**測定結果**:
- 適切なインデックスがある場合: 5-10%のオーバーヘッド
- インデックスがない場合: 最大3倍の遅延

**対策**:
1. `tenant_id`に必ずインデックスを作成
2. クエリプランを定期的に分析（`EXPLAIN ANALYZE`）
3. 複合インデックスで最適化

```sql
-- 効果的な複合インデックス
CREATE INDEX idx_users_tenant_created 
  ON users(tenant_id, created_at DESC);

-- このクエリが高速化される
SELECT * FROM users 
WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
ORDER BY created_at DESC
LIMIT 100;
```

**妥協点**: 
- パフォーマンスよりセキュリティを優先
- ただし、クリティカルパスでは慎重にチューニング

### スライド27: トレードオフ3 - スナップショットからのイベント生成

**課題**: 既存データからドメインイベントを遡及的に生成する際の一貫性

**問題の具体例**:
```
時刻T1: ユーザーA作成
時刻T2: 組織X作成
時刻T3: ユーザーAを組織Xに所属させる

→ イベント生成時に順序を間違えると、
  「存在しない組織にユーザーを所属させる」
  というイベントが生成されてしまう
```

**解決策**:
1. 依存関係グラフを構築
2. トポロジカルソートでイベント生成順序を決定
3. 外部キー制約を利用して検証

```typescript
// 依存関係の定義
const dependencies = {
  'UserCreated': [],
  'OrgCreated': [],
  'UserAssignedToOrg': ['UserCreated', 'OrgCreated'],
};

// イベント生成順序を決定
const sortedEvents = topologicalSort(dependencies);
// → ['UserCreated', 'OrgCreated', 'UserAssignedToOrg']
```

**教訓**: 
- 理想的には、最初からイベントを記録すべき
- 後付けは可能だが、コストが高い

### スライド28: トレードオフ4 - 共通ライブラリの誘惑

**問題**: DRYの原則を追求しすぎると、サービス間の結合度が上がる

**悪い例**:
```typescript
// 共通ライブラリに認可ロジックを含めた
export function authorize(user: User, resource: Resource): boolean {
  // 複雑な認可ロジック...
}

// → 認可ロジックを変更すると、全サービスを再デプロイ
```

**良い例**:
```typescript
// 各サービスが独自の認可ロジックを持つ
// userService/authorization.ts
export function canEditUser(actor: User, target: User): boolean {
  return actor.id === target.id || actor.role === 'ADMIN';
}

// orgService/authorization.ts
export function canEditOrg(actor: User, org: Org): boolean {
  return actor.orgId === org.id && actor.role === 'ORG_ADMIN';
}
```

**ガイドライン**:
- 型定義やバリデーションスキーマ → 共通化OK
- ビジネスロジック → 原則として共通化しない
- 共通化する場合は、破壊的変更を避けるバージョニング戦略

---

## 5. まとめ：開発チームができること (2分)

### スライド29: 今日のキーメッセージ

本日お伝えしたかったことを3つにまとめます。

**1. アーキテクチャ選択は原則から始める**

技術選定の前に、自分たちのシステムに必要な原則を明文化しましょう。私たちの場合は以下の4つでした：
- 基盤障害を波及させない
- 整合性と可用性の両立
- 完全なトレーサビリティ
- プロダクトチームの認知負荷軽減

**2. データの性質に応じて技術を使い分ける**

一つの技術で全てを解決しようとしないこと：
- 頻繁に変更されるデータ → DynamoDB + Outbox
- 頻繁に変更されないデータ → PostgreSQL + Delta Lake
- 強い整合性が必要 → サービスベースアーキテクチャ
- 疎結合が必要 → イベント駆動アーキテクチャ

**3. トレードオフを明示的にする**

完璧な設計は存在しません。重要なのは、トレードオフを認識し、チームで合意すること。

### スライド30: 開発チームができること

SREという役割を持たなくても、開発チームは信頼性向上に大きく貢献できます：

1. **アーキテクチャレベルでの信頼性確保**
   - RLSによるセキュリティ
   - イベントソーシングによるトレーサビリティ

2. **段階的な改善**
   - 全てを一度に完璧にする必要はない
   - まずはクリティカルな領域から

3. **標準技術の活用**
   - OpenID Connect、Delta Lake、PostgreSQL RLS
   - 枯れた技術を組み合わせる

### スライド31: 参考資料とQ&A

**関連資料**:
- Building an Authentication Platform using Authlete and AWS
- カケハシ開発者ブログ: 認証基盤の刷新

**質問があればぜひ！**

ご清聴ありがとうございました。

---

## 補足: Q&A想定質問

### Q1: RLSのパフォーマンスは実際どれくらい影響しますか？

A: 私たちの環境では、適切なインデックスがあれば5-10%のオーバーヘッドです。ただし、これはクエリパターンに依存します。特に、JOINが多いクエリや、複数テーブルにまたがるクエリでは影響が大きくなる可能性があります。重要なのは、セキュリティとパフォーマンスのトレードオフを明示的に認識することです。

### Q2: Delta Lakeへの移行は既存データをどう扱いましたか？

A: 段階的に移行しました。まず、新規データのみDelta Lake形式で書き込み、既存データは別途バッチで変換しました。重要なのは、移行中も両方のデータソースから読み取れるようにしたことです。

### Q3: ドメインイベントのストレージコストは？

A: PostgreSQLに6ヶ月分、S3に全履歴を保存しています。S3のコストは非常に安く、月間数千円程度です。重要なのは、検索性能とコストのバランスで、頻繁にアクセスするデータはPostgreSQL、古いデータはS3というハイブリッドアプローチを取っています。

### Q4: サービスベースアーキテクチャでのスケーラビリティは？

A: 各サービスは独立してスケールできます。ただし、データベースは共有しているため、PostgreSQLがボトルネックになる可能性があります。私たちは、読み取りレプリカを活用し、書き込みと読み取りを分離することで対応しています。
