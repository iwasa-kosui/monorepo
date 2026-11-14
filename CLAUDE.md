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
pnpm --filter iori run typecheck  # apps/iori を変更したとき
pnpm --filter '*' lint:fix
pnpm --filter '*' format
pnpm --filter '*' test:ci
pnpm --filter iori run test:workerd  # apps/iori を変更したとき
```

#### 実行ルール

- **tsc --noEmit**: コード変更後は必ず実行し、すべての型エラーを解消してください
- **typecheck**: apps/iori を変更したときは必ず実行してください。tsc --noEmit は apps/iori の型検査を実行しません
- **lint:fix**: コード変更後は必ず実行し、すべてのlintエラーを解消してください
- **format**: コミット前に必ず実行し、コードスタイルを統一してください
- **test**: 機能追加・修正後は必ず実行し、すべてのテストがパスすることを確認してください
- **test:workerd**: apps/iori を変更したときは必ず実行してください。test:ci は apps/iori の workerd のテストを含みません

これらのチェックがすべてパスしない限り、コードの変更は完了とみなしません。

---

## GitHub のメンションを書かない（必須）

GitHub 上で素の `@name` を書くと、その名前のアカウントを持つ人に通知（メール）が飛ぶ。
このリポジトリと無関係の人に迷惑がかかるため、次を守ること。

- コミットメッセージ、PR のタイトル・本文、Issue、コメント、レビューでは、`@` で始まる語を
  **必ずバッククォートで囲む**。例: bot のハンドル `` `@iori` ``、npm の `` `@atproto/api` ``、
  Fediverse の `` `@user@example.com` ``
- アプリ名や bot 名は `@` を付けずに書く（例: 「iori の bot」）
- PR の本文はコミットメッセージから作られるので、コミットメッセージも同じ扱いにする
- 人を呼ぶのは、ユーザーが明示的にその人を呼ぶよう頼んだときだけ

機械的な検査も入れている（検出ロジックは `.github/scripts/github-mentions/`）:

- Claude Code の PreToolUse フック（`.claude/settings.json`）: `git commit`・`gh pr`/`gh issue`/`gh api`・
  GitHub MCP の書き込みツールの入力に素のメンションがあれば止める
- git の commit-msg フック（`.githooks/`。`pnpm install` の `prepare` で `core.hooksPath` を設定する）
- CI（`.github/workflows/github-mentions.yml`）: PR のタイトル・本文・コミットメッセージを検査する

意図して人を呼ぶときだけ、コマンドの先頭に `ALLOW_GITHUB_MENTIONS=1` を付けて通す。

---

## 開発方針

設計パターンとドメインモデルの詳細は `.claude/rules/` に分割されています：

- `.claude/rules/schema-driven-domain-model.md` — Zod Schema-Driven + Always-Valid Domain Model
- `.claude/rules/result-rop.md` — ROP + レイヤードアーキテクチャにおけるResult使い分け
- `.claude/rules/event-driven.md` — Event-Driven Design
- `.claude/rules/domain-model-iori.md` — ioriの集約設計、ドメインイベント、ストア/リゾルバーパターン

上記はすべて `apps/iori/**`, `packages/**`, `apps/akashic-ts/**` 編集時に自動読み込み（domain-model-ioriは `apps/iori/**` のみ）。
