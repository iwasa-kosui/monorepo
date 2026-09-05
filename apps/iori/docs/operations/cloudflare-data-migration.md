# Cloudflare データ移行手順

この手順は停止を伴う一回限りの移行用です。二重書き込みは行いません。public repository を維持し、protected Environment の GitHub-hosted runner で実行します。生成される PostgreSQL export、D1 SQL、R2 upload manifest、検証 manifest はすべてリポジトリ外のアクセス制限された作業ディレクトリに置きます。Git、GitHub artifact・cache、Issue、ログには保存しません。

2026-09-06 時点では、移行元の凍結・snapshot・限定転送、移行先の準備記録、D1/R2/OGP の実 import、署名付き bundle の保存・復元を実装し、executor 全体の独立レビューを完了しました。hosted workflow への接続と統合検証は継続中です。[再開計画](../../../../docs/superpowers/plans/2026-09-05-iori-cloudflare-resume.md)の検証・保護設定・リハーサルを完了するまで本番操作を開始しません。

## 停止前の準備

1. environment と generation を分離した新しい D1、R2、KV、Queue、DLQ と Worker を準備します。以前のリソースと state は保持します。最初の Worker version は `sealed`、Queue は配送停止、route は未作成とし、実 ID と状態を照合した準備記録を専用 R2 へ保存します。
2. hosted runner からの SSH・Cloudflare・R2 接続、空き容量と実行時間をリハーサルで確認します。メンテナンス中の旧 deploy による remote 変更を、共有 concurrency と永続的な凍結 marker の検査で抑止します。
3. `$RUNNER_TEMP` 配下に mode `0700` の新しい作業ディレクトリを作り、ファイルは `0600` で生成します。準備済み R2 bucket で実行 ID を予約してから移行元を凍結します。再利用した実行 ID は拒否します。
4. メンテナンスを告知し、Lightsail の新規 HTTP を停止します。本文送信・キャンセルを含む受付済み HTTP、enqueue、dequeue、handler transaction が終了し、遅延行を含む Queue の深さが `0` になってから consumer を一時停止します。Node process は private control と export のために起動したままにします。

旧 CLI の `--lightsail-stopped` や `--fedify-queue-drained` という指定だけを静止の証拠にしません。export は同じ排他制御の下で実状態と起動中の build SHA を検査し、既存の source Env/TLS を使います。全 31 application table を同じ read-only repeatable-read transaction から cursor で書き出し、元の row JSON を canonical D1 順に外部ソートした NDJSON を生成します。transaction の commit と DB 接続の close が成功した後にだけ export manifest を確定します。

移行元の保存先は service user の `~/.iori-migration/exports/<main_sha>-<run_id>/` です。固定の table ファイルと manifest、および `post_images` から参照される画像だけを転送します。受信側は新しい private root の `export/` と `uploads/` に保存し、全ファイルの byte size と SHA-256 が一致した後に `source-inventory.json` を確定します。DB 接続情報を runner へコピーしません。SSH adapter は信頼済みの host key と既存 Node 24.12.0 の固定パスを使い、任意の remote command やファイルパスを受け付けません。

source snapshot の上限は row ごとに 8 MiB、画像ごとに 32 MiB、合計 10 GiB、table と manifest を含む 100,000 ファイルです。export は 30 分、各ファイルの転送は 5 分で中断を要求します。切断・timeout 後も実際の stream/DB cleanup が完了するまでは source control の排他を保持します。これらは hosted job 全体の所要時間や容量を保証しません。

停止前の容量検査では source に `table_bytes × 24 + upload_bytes × 2 + 64 MiB`、runner に `table_bytes × 24 + upload_bytes × 3 + 128 MiB` の空きを要求します。並べ替えと SQL 変換中の一時ファイルを含む保守的な見積もりです。各署名対象 JSON と bundle index の 16 MiB 上限も別に検査します。source のファイル数上限内でも manifest が収まるとは限りません。受付済みの書き込みによる増加に備え、drain 後にも容量を再確認します。

executor はさらに renderer・転送 buffer 用の 256 MiB と、記事がある場合は同時に扱う OGP 1 件分の 32 MiB を加算します。OGP を全件ディスクに保持する見積もりにはしません。D1 の容量計画は free の 500,000,000 bytes または paid の 10,000,000,000 bytes を指定し、`table_bytes × 4` が収まることを事前検査します。SQLite/index の実際の増加量は staging で確認します。

`IORI_MIGRATION_REHEARSAL_PATH` の private JSON は `iori-migration-rehearsal/v1` です。レビュー済み `main_sha`、ISO timestamp の `measured_at`、正の有限値である `bytes_per_second`、`rows_per_second`、`files_per_second`、`ogp_per_second` と、上記の `d1_capacity_bytes` を記録します。最初は同じ adapter と runner を使って代表的な匿名化サンプルを測定し、その保守的な値で全体リハーサルを実行します。実測値の代わりに pass flag や timeout の上書きを渡せません。

処理量と実測 rate から計算した時間を 2 倍し、固定 overhead と cleanup の余裕を含めて検査します。executor の期限は 5 時間 45 分で、6 時間の job 上限に cleanup の余裕を残します。各処理の timeout 上限をファイル数倍して通常の所要時間とは扱いません。技術上限内の全データがこの時間内に完了する保証ではなく、時間・空き容量・metadata のいずれかが不足すれば凍結前に失敗します。

## D1 import

`cloudflare:convert:d1` は checked-in の SQLite/D1 schema を検査し、外部 export manifest から INSERT-only SQL を生成する。

- UUID/varchar は SQLite text として扱う。
- timestamp は epoch milliseconds に正規化する。
- JSON は key を安定ソートした serialized text にする。
- table は foreign-key-safe な固定順で出力する。
- 各 SQL file は最大 32 MiB とし、UTF-8 byte size を測定して、同じ入力から同じ行境界で分割する。

各 INSERT 文の UTF-8 byte size も検査します。D1 の SQL statement 上限は 100,000 bytes で、ファイルの上限とは別です。source export の 8 MiB row 上限内でも、SQL として投入できるとは限りません。対応できない行を切り捨てずに失敗させ、すべての変換と検査が成功してから D1 の変更を始めます。[D1 の制限](https://developers.cloudflare.com/d1/platform/limits/)

全 SQL の変換、schema checksum、manifest と全ファイルの checksum、文ごとの上限検査を完了してから、固定の checked-in schema を Wrangler で適用します。全 31 application table の実 count が `0` であることを確認し、生成した全 SQL を manifest の順に import します。非空の DB の reset や、不確かな失敗後の自動再 import は行いません。SQL の内容や row data は terminal log に出力しません。

## R2 と OGP

executor は検証済みの `post_images` NDJSON を順に読み、`/uploads/<uuid>.<gif|jpeg|jpg|png|webp>` に対応する原画像だけを import します。source file の不在や UUID の不一致は失敗です。公式 S3 SDK の `PutObjectCommand` で content type、cache-control、SHA-256 の custom metadata を object 本体へ設定し、`post-images/<image-id>/original` に格納します。metadata sidecar は生成しません。`post_images.url` は既存の値を維持し、Worker が安定 URL と R2 key を対応させます。旧 `cloudflare:import:uploads` CLI は protected executor の利用を要求して停止します。

公開済み article の OGP は、既存の 1,200 × 630 のデザインを使う純粋な Node renderer で生成します。200 文字以下の title から PNG を作り、signature と 32 MiB 上限を検査して `og/<article-id>.png` へ 1 件ずつ upload します。公開記事が 0 件でも空の有効な manifest を生成します。Worker に `sharp` を追加せず、R2 の PNG を読み取ります。

font は凍結前に固定の Google Fonts CSS と許可された `fonts.gstatic.com` から取得します。CSS は 64 KiB / 15 秒、font は 16 MiB / 30 秒に制限し、redirect は拒否します。記事の title はネットワークの URL へ渡しません。upload/OGP manifest は private file へ逐次出力し、各 16 MiB の上限を再確認します。

## job 間の保存と復元

`prepare-migration-target.mjs` は独立した Terraform output と実状態を照合し、`prepared-target/v1/<environment>/<generation>/record.json` に準備記録を条件付きで保存します。後続 job の `read-migration-target.mjs` は指定済み backend を読み取り専用で開き、`IORI_MIGRATION_EXPECTED_TARGET_PATH` に期待値を生成します。期待値を bundle から組み立てません。account、backend key、generation、各実 ID と consumer の対応、受付 identity を厳密に照合します。

state・アプリ画像用とは別の、Terraform 管理の非公開 R2 bucket を使います。`r2.dev`、custom domain、アプリからの配信を無効にし、移行データ用 credential は state 用から分けます。bundle は environment・main SHA・migration run ID で識別し、全 application table の NDJSON、各 manifest、署名付き証跡と参照する全 artifact を保存します。秘密鍵、接続情報、Terraform state・plan、生成 config は含めません。config は各 job で再生成します。

`execute-protected-migration.mjs` は実処理の成功後にだけ各 phase の Ed25519 receipt を記録し、最終実データ検証後に `contract.json` と bundle を確定します。`iori-migration/v1/<environment>/<main_sha>/<run_id>/` の下に全ファイルを最大 64 MiB の部分へ分けて転送・照合し、完了 marker を最後に保存します。後続の `restore-protected-migration.mjs` は完了済み bundle を新しい空の private root へ復元します。同じ run ID の上書きは拒否します。

`iori-protected-migration-contract/v3` は相対パスを使い、復元先 root を変更しても署名済み bytes を維持します。絶対パス、`..`、symlink による root 外参照と旧 contract は拒否します。bundle には全 31 table の NDJSON と、参照する全 SQL file を含めます。manifest だけを保存して完了とはしません。

実行予約と bundle 公開時の予約は別です。転送失敗や部分 import があっても予約を解除せず、自動再開・再 import・移行元の自動復帰は行いません。失敗したデータは非公開のまま保持し、job の一時領域だけを検査して cleanup します。移行元の `freeze.json` と `freeze.pending` はプロセスの再起動で解除しません。書き込みの再開は [cutover runbook](./cloudflare-cutover-runbook.md) の明示的な復旧判断に従います。

bundle は cutover 完了から少なくとも 14 日間保持し、進行中・失敗中の run を一律 TTL で削除しません。保持期間と照合結果を確認し、削除承認後に cleanup します。詳細は [cutover runbook](./cloudflare-cutover-runbook.md)に従います。

## 検証と cutover

repository 内の provider が全 D1 table の実データをページ単位で読み、D1 表現へ正規化した count/checksum を比較します。R2 は object の bytes、HTTP/custom metadata、prefix 全体の listing を照合します。不足だけでなく余分な key、重複、進行しない cursor、API の不正な応答や上限超過も失敗です。外部の `IORI_IMPORT_RUNNER` module や bundle 内のコードは実行しません。出力は table ごとの件数と不一致の集計に限定し、row、token、URL、object identifier、SQL は表示しません。

新しい runner の restore CLI は `MAIN_SHA`、`IORI_MIGRATION_RUN_ID`、独立した expected target、公開鍵の pin を検査し、全 bundle の署名・hash・ファイルを確認します。その後、準備記録と同じ Worker version が現在も `sealed`、route 未作成、Queue 配送停止であることを API で読み取り、D1/R2/OGP の実データを再検証します。署名用秘密鍵、source SSH、書き込み用 credential はこの job に渡しません。

既存の単独 `cloudflare:verify:import` を使う場合も expected target と完了済み v3 contract が必須です。`IORI_MIGRATION_CONTRACT` と `IORI_EXPORT_MANIFEST`、`IORI_D1_IMPORT_MANIFEST`、`IORI_R2_IMPORT_MANIFEST`、`IORI_OGP_IMPORT_MANIFEST` は同じ private root 内の署名対象へ対応させます。通常の job 間再検証には、復元と検証を固定順で行う restore CLI を使います。

検証用公開鍵とその SHA-256 は Environment を信頼元とし、bundle 内の鍵は採用しません。準備時の sealed version は変更しない履歴として保持し、切替時の `sealed → smoke → active` は別の現在状態として検査します。後から準備記録や署名済み証跡を書き換えません。実データ再検証後、全 workers.dev smoke を通し、`smoke` のまま route を作成してから HTTP、最後に Queue を有効にします。通常操作の確認と復旧判断は [cutover runbook](./cloudflare-cutover-runbook.md)に従います。
