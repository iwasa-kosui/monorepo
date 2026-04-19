# AGENTS.md

## 開発ワークフロー

### コード品質チェック（必須）

コードを変更した場合、以下のコマンドを**必ず**実行してください：

```bash
# ワークスペースパッケージのビルド（初回または依存変更時）
pnpm --filter result run build

# kosui-me の型検査前に talks データを生成（未生成だと型エラーになる）
pnpm --filter kosui-me generate:talks

pnpm --filter '*' build
pnpm --filter '*' tsc --noEmit
pnpm --filter '*' lint:fix
pnpm --filter '*' format
pnpm --filter '*' test:ci
```

#### 実行ルール

- **tsc --noEmit**: コード変更後は必ず実行し、すべての型エラーを解消してください
- **lint:fix**: コード変更後は必ず実行し、すべてのlintエラーを解消してください
- **format**: コミット前に必ず実行し、コードスタイルを統一してください
- **test**: 機能追加・修正後は必ず実行し、すべてのテストがパスすることを確認してください

これらのチェックがすべてパスしない限り、コードの変更は完了とみなしません。

---

## 開発方針

設計パターンとドメインモデルの詳細は `.claude/rules/` に分割されています：

- `.claude/rules/schema-driven-domain-model.md` — Zod Schema-Driven + Always-Valid Domain Model
- `.claude/rules/result-rop.md` — ROP + レイヤードアーキテクチャにおけるResult使い分け
- `.claude/rules/event-driven.md` — Event-Driven Design
- `.claude/rules/domain-model-iori.md` — ioriの集約設計、ドメインイベント、ストア/リゾルバーパターン

上記はすべて `apps/iori/**`, `packages/**`, `apps/akashic-ts/**` 編集時に自動読み込み（domain-model-ioriは `apps/iori/**` のみ）。
