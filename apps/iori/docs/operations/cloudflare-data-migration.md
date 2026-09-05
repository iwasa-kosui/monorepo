# Cloudflare データ移行手順

この手順は停止を伴う一回限りの移行用です。二重書き込みは行いません。public repository を維持し、protected Environment の GitHub-hosted runner で実行します。生成される PostgreSQL export、D1 SQL、R2 upload manifest、検証 manifest はすべてリポジトリ外のアクセス制限された作業ディレクトリに置きます。Git、GitHub artifact・cache、Issue、ログには保存しません。

2026-09-05 の方針変更です。現行 workflow の self-hosted runner と事前配置パスへの依存を解消する実装は、[再開計画](../../../../docs/superpowers/plans/2026-09-05-iori-cloudflare-resume.md)の手順 2・3 に記載しています。この文書だけでは本番操作を開始できません。

## 停止前の準備

1. hosted runner からの SSH・Cloudflare・R2 接続、空き容量と実行時間をリハーサルで確認します。メンテナンス中の旧 deploy によるサービス再起動を抑止します。
2. メンテナンスを告知し、Lightsail への新規書き込みを停止します。Fedify の PostgreSQL queue を drain し、深さ 0 を確認してから配送処理を停止します。stale queue row は移行しません。
3. `$RUNNER_TEMP` 配下に mode `0700` の作業ディレクトリを作り、ファイルは `0600` で生成します。
4. 作業ディレクトリ、`UPLOAD_DIR` のコピー、各 manifest が Git top-level 配下でないことを確認します。失敗時を含め、job 終了時に一時ファイルを削除します。

`cloudflare:export:pg` は `--lightsail-stopped --fedify-queue-drained` の両方を指定しないと開始しない。export は固定順の application table を NDJSON へ書き、schema version、row count、SHA-256 checksum、timestamp だけを含む manifest を最後に complete にする。row contents、connection string、credential column を stdout/stderr に表示しない。

## D1 import

`cloudflare:convert:d1` は checked-in の SQLite/D1 schema を検査し、外部 export manifest から INSERT-only SQL を生成する。

- UUID/varchar は SQLite text として扱う。
- timestamp は epoch milliseconds に正規化する。
- JSON は key を安定ソートした serialized text にする。
- table は foreign-key-safe な固定順で出力する。
- Wrangler の 5 GiB import 上限を超える場合、UTF-8 byte size を測定し、deterministic row boundary で次の SQL file に分ける。単一 row が上限を超える場合は SQL file を作成せず失敗する。

schema migration を Wrangler で適用してから、生成 SQL を順に import する。SQL の内容や row data は terminal log に出力しない。

## R2 と OGP

`cloudflare:import:uploads --lightsail-stopped` は export manifest の `/uploads/<uuid>.<gif|jpeg|jpg|png|webp>` だけを読み、存在しない source file または imageId と一致しない UUID があれば中断する。object は content type、cache-control、SHA-256 を保持し、`post-images/<image-id>/original` に格納する。Wrangler 4.20 の object put は custom metadata flag を提供しないため、同じ external `0600` import manifest に加えて、`<key>.metadata.json` sidecar を R2 へ格納する。`post_images.url` は既存の `/uploads/<uuid>.<ext>` を維持し、Worker route mapping で安定 URL と R2 key を対応させる。

公開済み article の OGP は Worker 内で生成しない。既存の Node image pipeline は PNG bytes を返すため、事前承認済みの offline job で PNG signature を検証し、`og/<article-id>.png` に upload する。Worker は publish 時に OGP を書き込まず、R2 上の PNG を read-only で返す。以前の SVG 方針は Node pipeline の実 bytes と一致しないため、この PNG 方針で置き換える。`sharp` を Worker bundle へ追加しない。

## job 間の保存と復元

state・アプリ画像用とは別の、Terraform 管理の非公開 R2 bucket を使います。`r2.dev`、custom domain、アプリからの配信を無効にし、移行データ用 credential は state 用から分けます。bundle は environment・main SHA・migration run ID で識別し、全 application table の NDJSON、各 manifest、署名付き証跡と参照する全 artifact を保存します。秘密鍵、接続情報、Terraform state・plan、生成 config は含めません。config は各 job で再生成します。

全ファイルの転送と照合後に完了 marker を保存します。後続 job は完了済み bundle を新しい作業領域へ復元し、同じ run ID の完了済みデータを上書きしません。新しい contract version は相対パスを使い、復元先 root を変更しても署名済み bytes を維持します。絶対パス、`..`、symlink による root 外参照と旧 contract は拒否します。検証には export の実データも必要なため、manifest だけを保存して完了としません。

bundle は cutover 完了から少なくとも 14 日間保持し、進行中・失敗中の run を一律 TTL で削除しません。保持期間と照合結果を確認し、削除承認後に cleanup します。詳細は [cutover runbook](./cloudflare-cutover-runbook.md)に従います。

## 検証と cutover

`cloudflare:verify:import` は export、変換後の D1 import、upload、OGP manifest から expected state を作り、repository-owned provider contract を通じて actual state を比較する。`IORI_D1_IMPORT_MANIFEST` は `cloudflare:convert:d1` が外部の mode `0700` ディレクトリ内へ生成する mode `0600` の manifest を指し、そこに PostgreSQL の時刻と JSON を D1 表現へ変換した canonical per-table checksum と row count を保持する。現行の外部 `IORI_IMPORT_RUNNER` module は、レビュー済み SHA に含まれる repository 内の provider へ変更します。provider は `getTableSummaries(tableNames)`、`getObject(key)`、`listObjects(prefix, cursor?)` を実装し、接続設定だけを Environment から受け取ります。データ bundle 内の module を実行しません。前者は同じ canonical D1 row 表現の count/checksum を返し、`getObject` は R2 object の bytes/HTTP metadata を返し、`listObjects` は指定 prefix の bounded page（`{ keys, cursor? }`）を返す。runner は Cloudflare のページングを完了させず、cursor がなくなるまで検証側がページを順に取得する。検証は expected key だけでなく list 結果の余分な key、重複、未進行 cursor も検出し、listing API がない/不正なら fail closed する。Wrangler の upload が生成する `<expected-key>.metadata.json` sidecar だけは object 本体との比較から除外し、任意の metadata key は余分な object として失敗させる。ページは最大 1,000 key、検証は最大 100,000 page/ key を受け付け、上限超過も fail closed する。CLI は runner を import するだけで、runner の接続設定・credential・actual data は出力しない。table count と checksum、R2 object、公開 article の OGP object に不一致があれば non-zero で終了する。出力は `table=<name> expected=<count> actual=<count>`、checksum mismatch、R2/OGP の aggregate missing count のみであり、row、token、URL、object identifier、SQL を出力しない。

検証用公開鍵とその digest は Environment から受け取り、bundle に含まれる鍵を信頼元にしません。別 job で同じ bundle を復元し、署名、全ファイル、D1/R2/OGP の実データを再検証します。verification、health check、sign-in、upload、timeline、ActivityPub delivery を確認してから route を切り替えます。Lightsail は確認が終わるまで read-only と backup を保持します。
