# Cloudflare 移行計画

## 目的

`apps/iori` を現在の Lightsail + PostgreSQL + ローカルファイルシステム構成から、Cloudflare Workers + D1 + R2 構成へ移行する。Fedify の配送処理には Cloudflare Queues を使う。Durable Objects は、D1 と Queues だけでは扱いにくい調整・逐次化の問題が具体化した場合に導入する。

計画停止は許容する。二重書き込みではなく、停止してからエクスポートし、Cloudflare 側へインポートする方式を採用する。

## 現行構成の棚卸し

- Runtime: `@hono/node-server` で起動する Node.js + Hono。
- Database: Drizzle `node-postgres` と `pg-core` 経由の PostgreSQL。
- Fedify 永続化: `PostgresKvStore` と `PostgresMessageQueue`。
- アップロード保存先: `UPLOAD_DIR` または `process.cwd()/uploads` 配下のローカルファイルシステム。
- 静的アセット配信: Node プロセス内の `@hono/node-server/serve-static`。
- 動的画像処理: アップロード画像の WebP 変換と OGP PNG 生成に `sharp` を使用。
- Secrets: `DATABASE_URL`, `ORIGIN`, VAPID キー, PostgreSQL CA ファイルパス。

Workers 化の主なブロッカー:

- `node:fs`, `node:path`, `@hono/node-server`, `pg`, `postgres` は本番 Worker の実行パスから外す必要がある。
- `sharp` は Worker 本番パスで使わない。Edge で扱える画像処理方式へ置き換える。
- 現在の Drizzle schema は PostgreSQL dialect API を使っている。D1 では SQLite dialect の schema と migration が必要になる。
- Fedify は process-level singleton ではなく、リクエストごとに Cloudflare bindings から構築する必要がある。

## 移行後の構成

- HTTP app: Node server -> Cloudflare Worker `fetch` handler。
- アプリDB: Lightsail PostgreSQL -> Cloudflare D1。
- アップロード: ローカルディスク -> Cloudflare R2 bucket。
- 静的ファイル: Node `serveStatic` -> Workers static assets binding。
- Fedify KV: PostgreSQL -> `@fedify/fedify/x/cfworkers` 経由の Cloudflare KV。
- Fedify queue: PostgreSQL -> `@fedify/fedify/x/cfworkers` 経由の Cloudflare Queues。
- Secrets: `.env`/systemd -> Wrangler secrets。
- Durable Objects: なし -> actor 単位の逐次化や entity 単位の調整が必要になった場合のみ導入。

## Durable Objects の判断

初回移行では、具体的な ordering/coordination の問題が出るまで Durable Objects は導入しない。

Fedify には Cloudflare Workers 向けの Queue 実装があり、Cloudflare Queues は非同期配送と retry に向いている。そのため、Fedify の outgoing work は Queues を優先する。

Durable Objects を追加する条件:

- Queues + Fedify ordering だけでは、actor 単位の逐次配送を十分に担保できない。
- 単一の論理 entity に対して、高並行アクセス下で強整合な状態遷移が必要になる。
- WebSocket や長時間接続を伴う調整処理を追加する。

全 federation や全 job を 1 つの Durable Object に集約しない。スループット上のボトルネックになる。

## 実装フェーズ

### Phase 1: Cloudflare Runtime Skeleton

1. Worker entrypoint を追加する。例: `src/worker.ts`。
2. `wrangler.jsonc` を追加する。
   - `compatibility_date`
   - `compatibility_flags: ["nodejs_compat"]`
   - D1 binding。例: `DB`
   - R2 bucket binding。例: `UPLOADS`
   - Fedify 用 KV namespace binding。例: `FEDIFY_KV`
   - Fedify 用 Queue producer/consumer binding。例: `FEDIFY_QUEUE`
   - static assets binding。例: `ASSETS`
   - observability
3. 移行中に既存の開発・テストを壊さないため、ローカル Node entrypoint は当面残す。
4. app 生成処理を、process-level singleton ではなく Worker `Env` 由来の依存を受け取る形へリファクタする。

### Phase 2: D1 Adapter

1. PostgreSQL schema の横に SQLite/D1 用 Drizzle schema を作る。
2. PostgreSQL column type を変換する。
   - `uuid` -> `text`
   - `varchar` -> `text`
   - `timestamp({ mode: "date" })` -> epoch milliseconds の integer か ISO text。どちらかに全体で統一する。
   - `json` -> JSON serialized text。ただし Drizzle SQLite の JSON mode を一貫して採用するならそれでもよい。
3. Worker adapter では `drizzle-orm/node-postgres` を `drizzle-orm/d1` に置き換える。
4. repository adapter は D1 database handle を注入される形にする。PostgreSQL adapter は必要ならローカル移行ツール用として残す。
5. D1 互換 migration を生成し、既存の index と unique constraint が表現されていることを確認する。

### Phase 3: R2 Uploads

1. `/api/v1/upload` のファイルシステム書き込みを `env.UPLOADS.put(key, body, metadata)` に置き換える。
2. `/uploads/:filename` のファイルシステム読み込みを `env.UPLOADS.get(key)` に置き換える。
3. `post_images.url` には安定した path を保存する。可能なら現在の `/uploads/<uuid>.webp` 形式を維持する。
4. 画像変換方針を決める。
   - 初期移行では、検証済みの元画像を R2 に保存し、content type を維持して配信するのが安全。
   - WebP 正規化を維持するなら、Cloudflare Images、build-time/offline 変換 job、または WASM image codec を検討する。

### Phase 4: Fedify on Cloudflare

1. 既存 `@fedify/fedify/x/cfworkers` の Cloudflare adapter を使う。
2. `PostgresKvStore` を `WorkersKvStore` に置き換える。
3. `PostgresMessageQueue` を `WorkersMessageQueue` に置き換える。
4. Worker handler 内で Cloudflare bindings から Fedify を構築する。
5. Worker の `queue()` handler を追加し、Fedify queued-task processing を呼び出して、message ごとに `ack()` / `retry()` する。
6. production cutover 前に dead-letter queue を設定する。

### Phase 5: Static Assets and OGP Images

1. 静的アセット配信を Workers static assets に移す。
2. app/API/Fedify の path は Worker first で処理し、通常の静的ファイルは asset binding に任せる。
3. OGP 生成は置き換える。`sharp` は Worker 本番依存にしない。
   - 短期: publish 時に OGP 画像を事前生成し、R2 に保存する。
   - 代替: consuming client が許容するなら SVG を直接返す。
   - 長期: Cloudflare Images または別 Worker/container による画像生成を検討する。

### Phase 6: Data Export and Import

計画停止時の流れ:

1. メンテナンス時間を告知する。
2. Lightsail の app service を停止し、以降の書き込みを止める。
3. Lightsail から PostgreSQL の data と schema をエクスポートする。
4. Lightsail の `UPLOAD_DIR` からアップロードファイルをエクスポートする。
5. PostgreSQL data を D1 互換 SQL に変換する。
   - schema を SQLite syntax に変換する。
   - UUID column を text に変換する。
   - timestamp を D1 側で選んだ表現へ変換する。
   - JSON を一貫した形式で serialize する。
   - foreign key を考慮して table import order を維持する。
6. Wrangler で schema と data を D1 に import する。
7. 既存の `post_images.url` と対応する key でファイルを R2 に upload する。
8. Fedify KV/queue state を import するか、意図的に reset するか決める。
   - Fedify が必要とする durable cache/state が KV にあるなら移行する。
   - Queue は停止前に drain するのが基本。必要がない限り stale queue row は import しない。
9. Worker preview/production route に対して verification query と smoke test を実行する。
10. DNS/route を Cloudflare Worker に切り替える。
11. ActivityPub delivery、sign-in、upload、timeline が確認できるまで、Lightsail は read-only のまま保持し、backup も残す。

## 検証チェックリスト

- Workers 上の `/health` が OK を返す。
- sign-in と session cookie flow が動く。
- local timeline と user profile が表示される。
- local post 作成で D1 row が書き込まれる。
- upload endpoint が R2 に書き込み、`/uploads/:filename` が object を返す。
- ActivityPub の actor, key, outbox, inbox, object URL が有効な JSON-LD を返す。
- follow, like, reply, repost, undo, relay subscription が Cloudflare Queue に enqueue され、consumer で処理される。
- Web Push が Wrangler secrets の VAPID key で送信できる。
- OGP endpoint または置き換え後の image URL が動く。
- production Worker bundle が `node:fs`, `@hono/node-server`, `pg`, `postgres`, `sharp` を import していない。

## 実装メモ

Phase 1-4 scaffolding では、Worker entrypoint は既存 Node app を直接 import しない migration shell として追加した。既存 `src/app.tsx` は `node:fs`, `@hono/node-server/serve-static`, `sharp`, PostgreSQL adapter を module graph に含むため、Worker の `fetch` handler へそのまま接続していない。

追加済みの Worker 経路は `/healthz`, `/health`, R2-backed `/uploads/:filename` に限定している。既存 `/api/v1/upload` と各 API route は Node/PostgreSQL 経路を維持し、後続 task で use case ごとの D1/R2 adapter 注入に合わせて段階的に移す。

Fedify Cloudflare wiring は Fedify 1.10 互換のため、既存 `@fedify/fedify/x/cfworkers` の `WorkersKvStore` / `WorkersMessageQueue` と Cloudflare Queue consumer の土台を追加した。Fedify 1.10 系の `x/cfworkers` には `WorkersMessageQueue.processMessage()` がないため、orderingKv / processMessage による ordering lock は Fedify 2 系アップグレード後に導入する。既存 Fedify dispatchers は PostgreSQL adapter を参照するため、Worker shell ではまだ ActivityPub HTTP routes に接続していない。

## Rollback

DNS 切り替え前の rollback は、Lightsail を active origin のままにすればよい。

DNS 切り替え後:

1. Worker を maintenance mode にする。
2. DNS/route を Lightsail に戻す。
3. cutover 後に D1/R2 へ書き込みが発生していた場合は、Lightsail を write 再開する前に該当 row/file を手動で reconcile する。

計画停止が許容されているため、dual-write rollback の複雑さより、短い frozen window を優先する。

## 確認した参照情報

- Fedify deployment guide: Cloudflare Workers support は Workers KV と Cloudflare Queues を使う。
- Cloudflare D1 import/export guide: D1 は Wrangler 経由で SQLite 互換 SQL dump を import する。
- Cloudflare R2 Workers API reference: Workers は bucket binding の `get` / `put` で R2 を操作する。
- Cloudflare Workers static assets docs: static assets は binding として Worker から参照できる。
- Cloudflare Durable Objects docs: DO は stateless request handling ではなく stateful coordination に使う。
