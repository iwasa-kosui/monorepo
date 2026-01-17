# monorepo

pnpm workspaces を使用したモノレポプロジェクトです。

## プロジェクト構造

```
.
├── apps/
│   └── microblog/   # ActivityPub 対応のマイクロブログ
├── packages/
│   ├── pipe/        # パイプユーティリティ
│   └── result/      # Result 型ライブラリ
└── talks/           # プレゼンテーション資料
```

## 必要条件

- Node.js 24.12.0
- pnpm 10.12.4

## セットアップ

```bash
# 依存関係のインストール
pnpm install

# packages/result のビルド（他のパッケージが依存）
pnpm run build --filter @iwasa-kosui/result
```

## 開発コマンド

各パッケージのディレクトリで以下のコマンドを実行できます。

```bash
# 型チェック
pnpm exec tsc --noEmit

# テスト
pnpm test

# 開発サーバー起動（アプリケーション）
pnpm dev
```

### apps/microblog 固有のコマンド

```bash
# Lint
pnpm lint
pnpm lint:fix

# フォーマット
pnpm format
pnpm format:check

# データベース
pnpm drizzle:push
pnpm drizzle:generate
pnpm drizzle:migrate

# Docker Compose
pnpm compose:up
pnpm compose:down
```

## パッケージ詳細

### @iwasa-kosui/result

Railway Oriented Programming をサポートする Result 型ライブラリです。neverthrow に似た API を提供します。

### @iwasa-kosui/pipe

関数合成のためのパイプユーティリティです。

### apps/microblog

[Fedify](https://fedify.dev/) を使用した ActivityPub 対応のマイクロブログアプリケーションです。Hono + Drizzle ORM + PostgreSQL で構築されています。

## 開発方針

開発方針の詳細は [AGENTS.md](./AGENTS.md) を参照してください。

- Schema-Driven Development with Zod
- Always-Valid Domain Model
- Railway Oriented Programming with neverthrow
- Event-Driven Design

## CI/CD

- GitHub Actions による自動テスト・型チェック
- apps/microblog の自動デプロイ

## ライセンス

ISC
