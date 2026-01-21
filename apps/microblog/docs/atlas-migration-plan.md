# Atlas移行実装計画

## 概要

このドキュメントでは、drizzle-kitからAtlasへの移行手順を段階的に説明する。

## 前提条件

- 既存のDrizzle ORMスキーマ（`src/adaptor/pg/schema.ts`）は変更しない
- 既存のマイグレーション履歴（`drizzle/`）は参照用に保持
- 本番データベースは既に最新のマイグレーションが適用済み

## Phase 1: 環境セットアップ

### 1.1 Atlasのインストール

```bash
# macOS (Homebrew)
brew install ariga/tap/atlas

# または curl
curl -sSf https://atlasgo.sh | sh

# バージョン確認
atlas version
```

### 1.2 drizzle-kit exportの確認

```bash
# Drizzleスキーマからの DDL エクスポートをテスト
pnpm drizzle-kit export
```

### 1.3 atlas.hclの作成

`apps/microblog/atlas.hcl`:

```hcl
data "external_schema" "drizzle" {
  program = ["npx", "drizzle-kit", "export"]
}

env "local" {
  src = data.external_schema.drizzle.url
  dev = "docker://postgres/16/dev?search_path=public"
  migration {
    dir = "file://atlas/migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}

env "production" {
  src = data.external_schema.drizzle.url
  migration {
    dir = "file://atlas/migrations"
  }
}

# 除外するテーブル（Fedifyが管理）
lint {
  non_linear {
    enabled = true
  }
}

diff {
  skip {
    drop_table = true
  }
}
```

### 1.4 ディレクトリ構成

```
apps/microblog/
├── atlas.hcl                 # Atlas設定ファイル（新規）
├── atlas/
│   └── migrations/           # Atlasマイグレーションファイル（新規）
├── drizzle/                  # 既存（参照用に保持）
├── drizzle.config.ts         # 既存（drizzle-kit export用に保持）
└── src/
    └── adaptor/pg/schema.ts  # 既存（変更なし）
```

## Phase 2: ベースラインの確立

### 2.1 現在のスキーマをAtlasでキャプチャ

```bash
# 現在のDBスキーマをベースラインとしてキャプチャ
atlas migrate diff baseline \
  --env local \
  --to "file://schema.sql"
```

### 2.2 既存DBへのベースラインマーキング

```bash
# 本番DBにベースラインを適用済みとしてマーク
atlas migrate apply \
  --env production \
  --url "$DATABASE_URL" \
  --baseline "baseline"
```

これにより、Atlasは既存のスキーマを「初期状態」として認識する。

## Phase 3: 開発ワークフローの確立

### 3.1 ローカル開発用スクリプト

`package.json`に追加:

```json
{
  "scripts": {
    "atlas:diff": "atlas migrate diff --env local",
    "atlas:apply": "atlas migrate apply --env local --url \"$DATABASE_URL\"",
    "atlas:status": "atlas migrate status --env local --url \"$DATABASE_URL\"",
    "atlas:lint": "atlas migrate lint --env local --latest 1",
    "atlas:hash": "atlas migrate hash --env local"
  }
}
```

### 3.2 スキーマ変更の典型的なフロー

```bash
# 1. schema.ts を編集

# 2. マイグレーションファイルを生成
pnpm atlas:diff add_new_column

# 3. 生成されたSQLを確認・レビュー
cat atlas/migrations/YYYYMMDDHHMMSS_add_new_column.sql

# 4. ローカルDBに適用
pnpm atlas:apply

# 5. lint実行
pnpm atlas:lint

# 6. コミット
git add atlas/migrations/
git commit -m "feat(db): add new column to posts table"
```

## Phase 4: CI/CD統合

### 4.1 GitHub Actions ワークフロー

`.github/workflows/atlas-ci.yml`:

```yaml
name: Atlas CI

on:
  pull_request:
    paths:
      - 'apps/microblog/src/adaptor/pg/schema.ts'
      - 'apps/microblog/atlas/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ariga/setup-atlas@v0
        with:
          cloud-token: ${{ secrets.ATLAS_CLOUD_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Install dependencies
        run: pnpm install
        working-directory: apps/microblog

      - name: Lint migrations
        run: atlas migrate lint --env local --latest 1
        working-directory: apps/microblog

      - name: Verify migration integrity
        run: atlas migrate validate --env local
        working-directory: apps/microblog
```

### 4.2 デプロイ時のマイグレーション

デプロイスクリプト（`deploy.sh`）に追加:

```bash
# マイグレーション適用
atlas migrate apply \
  --env production \
  --url "$DATABASE_URL"
```

## Phase 5: 旧システムからの完全移行

### 5.1 drizzle-kitスクリプトの削除

移行完了後、`package.json`から以下を削除:

```json
{
  "scripts": {
    "drizzle:push": "...",     // 削除
    "drizzle:generate": "...", // 削除
    "drizzle:migrate": "..."   // 削除
  }
}
```

### 5.2 ドキュメント更新

`README.md`のスキーマ管理セクションを更新:

```markdown
## スキーマ管理

このプロジェクトはAtlasを使用してデータベーススキーマを管理しています。

### マイグレーションの生成

\`\`\`bash
pnpm atlas:diff <migration_name>
\`\`\`

### マイグレーションの適用

\`\`\`bash
pnpm atlas:apply
\`\`\`
```

## チェックリスト

### Phase 1: 環境セットアップ
- [ ] Atlasをインストール
- [ ] `drizzle-kit export`が動作することを確認
- [ ] `atlas.hcl`を作成
- [ ] `atlas/migrations/`ディレクトリを作成

### Phase 2: ベースライン確立
- [ ] ベースラインマイグレーションを生成
- [ ] ローカルDBでベースラインをテスト
- [ ] ステージング環境でベースラインを適用
- [ ] 本番環境でベースラインをマーク

### Phase 3: 開発ワークフロー
- [ ] npm scriptsを追加
- [ ] チームにワークフローを共有
- [ ] 最初のマイグレーションをAtlasで実行

### Phase 4: CI/CD統合
- [ ] GitHub Actionsワークフローを作成
- [ ] Atlas Cloud トークンを設定（オプション）
- [ ] デプロイスクリプトを更新

### Phase 5: 完全移行
- [ ] 2-3回のリリースサイクル後、drizzle-kitスクリプトを削除
- [ ] ドキュメントを更新
- [ ] 古い`drizzle/`ディレクトリをアーカイブまたは削除

## 参考コマンド一覧

| コマンド | 説明 |
|---------|------|
| `atlas migrate diff <name>` | スキーマ変更からマイグレーション生成 |
| `atlas migrate apply` | 保留中のマイグレーションを適用 |
| `atlas migrate status` | マイグレーション状態を確認 |
| `atlas migrate lint` | マイグレーションの安全性をチェック |
| `atlas migrate validate` | マイグレーションファイルの整合性を検証 |
| `atlas schema inspect` | 現在のDBスキーマを出力 |
| `atlas schema apply` | 宣言的にスキーマを適用（開発用） |

## トラブルシューティング

### Fedifyテーブルとの競合

`drizzle.config.ts`で除外しているFedifyのテーブル（`fedify_kv_v2`, `fedify_message_v2`）は、`atlas.hcl`でも同様に除外する必要がある:

```hcl
env "local" {
  exclude = ["fedify_kv_v2", "fedify_message_v2"]
}
```

### カラム名のスネークケース変換

DrizzleのスキーマはcamelCaseで定義されているが、PostgreSQLではsnake_caseで保存される。Atlasは`drizzle-kit export`の出力を使用するため、この変換は自動的に処理される。

### データマイグレーション

純粋なスキーマ変更以外のデータマイグレーション（例: カラムの値の変換）は、Atlasの自動生成では対応できない。これらは手動でマイグレーションファイルを編集する必要がある:

```sql
-- atlas/migrations/YYYYMMDDHHMMSS_rename_column.sql

-- Atlas生成部分
ALTER TABLE posts ADD COLUMN new_status varchar(32);

-- 手動追加: データマイグレーション
UPDATE posts SET new_status = CASE
  WHEN old_status = 'active' THEN 'published'
  ELSE old_status
END;

ALTER TABLE posts DROP COLUMN old_status;
ALTER TABLE posts RENAME COLUMN new_status TO status;
```
