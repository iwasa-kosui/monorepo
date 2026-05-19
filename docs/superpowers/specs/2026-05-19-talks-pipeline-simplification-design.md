# talks デプロイパイプライン簡素化と package.json 引数化 設計書

- 起票日: 2026-05-19
- 対象: `talks/`, `apps/kosui-me/`, `.github/workflows/`
- 関連 worktree: `feat/talks-pipeline-simplification`

## 背景と課題

現在の `talks/` 配下と kosui-me のデプロイパイプラインには以下の痛点がある。

### 1. `talks/package.json` の scripts 爆発

新規登壇を追加するたびに `dev:YYYY-name` / `build:YYYY-name` / `export:YYYY-name` を package.json に手書きで追加している。テーマも `dev:theme-<name>` を都度追加。現状 30 行以上が登壇ごと・テーマごとの定型 scripts で占められており、追加コストとレビューノイズが大きい。

### 2. 二重デプロイ

`talks.kosui.me`（Cloudflare Pages の `talks` プロジェクト）と `kosui.me/talks/`（kosui-me）が同じ登壇コンテンツを別ドメインに公開している。kosui-me 側にはすでに `apps/kosui-me/src/pages/talks/index.astro` と `apps/kosui-me/src/pages/talks/[year]/[name].astro` があり、UI 上は kosui.me だけで完結している。

### 3. discovery / build ロジック重複

`talks/scripts/build.mjs` と `apps/kosui-me/scripts/build-slidev.mjs` が「`talks/YYYY/name/` を走査し Slidev でビルドする」というロジックを別々に実装している。`fetch-ogp.mjs` も両者に存在し中身が異なる。

## スコープ判断

- **2 と 1 を本タスクで解消する**。`talks.kosui.me` を廃止して kosui.me に一本化することで、talks 側の Astro index / Cloudflare Pages 関連を「共通化」せず「単純削除」できる。これによりロジック重複も自然消滅する範囲（`talks/scripts/build.mjs` 系）が縮む。
- **3 のうち残る重複（kosui-me 側 `build-slidev.mjs` と将来の talks 共通ロジック抽出）は範囲外**。ユーザーと合意済み。

## 設計

### A. talks.kosui.me 廃止

| 対象 | アクション |
|---|---|
| `.github/workflows/deploy-talks.yml` | 削除 |
| `talks/wrangler.json` | 削除 |
| Cloudflare Pages `talks` プロジェクト | DNS 切り戻し含め手作業で別途対応（本タスク範囲外、PR description に明記） |

`deploy-kosui-me.yml` の `paths: talks/**` トリガーは現状維持。kosui-me が talks コンテンツをビルド対象に取り込み続けるため正しい挙動。

### B. talks Astro index 廃止

kosui-me が代替済みのため、以下を削除。

| 対象 | 理由 |
|---|---|
| `talks/src/` | Astro index の実装。kosui-me の `pages/talks/` が代替 |
| `talks/astro.config.mjs` | 同上 |
| `talks/tailwind.config.mjs` | 同上 |
| `talks/tsconfig.json` | `include: ["src/**/*.ts", "src/**/*.astro"]` のみで src 削除と同時に不要 |
| `talks/scripts/build.mjs` | Astro index + Slidev 一括ビルドのオーケストレーター。本番デプロイ廃止と同時に不要 |
| `talks/scripts/build-redirects.mjs` | Cloudflare Pages の `_redirects` 生成。プロジェクト廃止と同時に不要 |
| `talks/scripts/fetch-ogp.mjs` | Astro index 用 OGP 取得。kosui-me 側に同名スクリプトが存在 |
| `talks/scripts/generate-og-images.mjs` | Astro index 用 OGP 画像生成。kosui-me 側に同名スクリプトが存在 |
| `talks/.gitignore` の `.ogp-cache.json` | fetch-ogp.mjs と運命を共にする |
| ルート `.gitignore` の `dist-astro/` | talks 専用のためクリーンアップ |

`talks/dist/` はルート `.gitignore` の `dist` ルールで引き続き ignore される。

### C. talks/package.json の scripts 引数化

#### 新しい scripts セクション

```jsonc
{
  "scripts": {
    "list": "node scripts/list.mjs",
    "dev": "node scripts/dev.mjs",
    "dev:theme": "node scripts/dev-theme.mjs",
    "export": "node scripts/export.mjs"
  }
}
```

#### 利用例

```sh
pnpm --filter talks list                       # 登壇/テーマ一覧
pnpm --filter talks dev 2026/sre-kaigi-2026    # Slidev dev 起動
pnpm --filter talks dev:theme kosui            # テーマの example.md を Slidev 起動
pnpm --filter talks export 2025/fp-matsuri     # PDF 等を export
```

引数を省略した場合は `list` 相当の出力をして `exit 1`（誤実行防止 + 利用可能識別子の即時可視化）。

#### 各スクリプトの実装方針

いずれも 30〜50 行程度の薄いラッパ。

- **`list.mjs`**: `talks/YYYY/name/` を走査し `slides.md` の存在で local / external（`metadata.yaml` のみ）を判定。`themes/<name>/example.md` の存在で利用可能テーマを列挙。
- **`dev.mjs`**: 引数 `<year>/<name>` を受け、`slides.md` の存在チェック後 `pnpm exec slidev <year>/<name>/slides.md --open` を `execSync` で実行。
- **`dev-theme.mjs`**: 引数 `<theme-name>` を受け、`themes/<name>/example.md` の存在チェック後 `pnpm exec slidev themes/<name>/example.md --open` を実行。
- **`export.mjs`**: 引数 `<year>/<name>` を受け、`pnpm exec slidev export <year>/<name>/slides.md` を実行。

各スクリプトは共通の `find-talks.mjs` / `find-themes.mjs` を持たず、単純な `existsSync` + `execSync` だけで構成する（YAGNI）。`list.mjs` だけが走査ロジックを持つ。

### D. talks/package.json の dependencies 整理

talks/src/ と Astro index 関連スクリプトの削除により以下が不要になる。実装フェーズで `pnpm --filter talks remove` で操作する。

| パッケージ | 判定 | 根拠 |
|---|---|---|
| `astro`, `@astrojs/tailwind`, `tailwindcss` | 削除 | Astro index 専用 |
| `wrangler` | 削除 | talks Cloudflare Pages 廃止 |
| `open-graph-scraper`, `satori`, `sharp` | 削除 | Astro index 用 OGP/画像生成のみで使用 |
| `playwright-chromium` | 要確認 | 旧 fetch-ogp / generate-og-images が依存していたら削除 |
| `@types/js-yaml`, `js-yaml` | 要確認 | 新 list.mjs が frontmatter を解析するなら維持、`existsSync` のみで終わるなら削除 |
| `@types/node` | 要確認 | TS ファイルが残らないなら削除 |
| `@slidev/*`, `fp-ts`, `markdown-it-github-alerts`, `newtype-ts`, `vue`, `@iconify-json/*` | 維持 | Slidev 本体およびテーマ依存 |

「要確認」のものは実装時に grep で根拠を取り、判断に迷ったら **保守的に維持**。最終判断は PR description に列挙する。

### E. CI/ローカル動作確認

実装後に以下が通ることを確認。

1. `pnpm install --frozen-lockfile` で lockfile 整合
2. `pnpm --filter kosui-me run build` で kosui-me が talks コンテンツを取り込んだフルビルドに成功
3. `pnpm --filter talks list` の出力が登壇/テーマを正しく列挙
4. `pnpm --filter talks dev 2026/sre-kaigi-2026` で Slidev が起動（手動確認）
5. `deploy-kosui-me.yml` の `paths: talks/**` でトリガーされることを PR の Files changed で確認

## 影響と移行

### 不可逆な手作業

- `talks.kosui.me` の DNS / Cloudflare Pages プロジェクトの停止は PR マージ後に別途手作業で実施
- PR description にチェックリスト化する

### コミット分割

1. `chore(talks): talks.kosui.me 用の Cloudflare Pages 設定とデプロイワークフローを削除`
   - `.github/workflows/deploy-talks.yml`, `talks/wrangler.json`
2. `chore(talks): kosui-me に統合済みの Astro index 実装を削除`
   - `talks/src/`, `talks/astro.config.mjs`, `talks/tailwind.config.mjs`, `talks/tsconfig.json`, `talks/.gitignore`, ルート `.gitignore` から `dist-astro/`
3. `refactor(talks): scripts を引数化 CLI に集約し旧ビルドオーケストレータを削除`
   - 新 `scripts/list.mjs` `dev.mjs` `dev-theme.mjs` `export.mjs`
   - 旧 `scripts/build.mjs` `build-redirects.mjs` `fetch-ogp.mjs` `generate-og-images.mjs`
   - `talks/package.json` の scripts セクション縮小
4. `chore(talks): Astro index 廃止に伴い不要になった dependencies を削除`
   - 上表の確定削除分

## 非目的（明示）

- kosui-me 側 `build-slidev.mjs` の触り込み、talks 側との共通化
- `apps/kosui-me/scripts/fetch-ogp.mjs` の整理
- DNS 切り替え作業（手作業で別途）
- 過去 PR で生成された `dist/` の git 履歴掃除
