# Cloudflare データ移行手順

この手順は停止を伴う一回限りの移行用である。二重書き込みは行わない。生成される PostgreSQL export、D1 SQL、R2 upload manifest、検証 manifest はすべてリポジトリ外のアクセス制限された作業ディレクトリに置く。これらを Git、CI artifact、issue、ログへ保存・貼り付けしてはいけない。

## 停止前の準備

1. メンテナンスを告知し、Lightsail app service を停止する。
2. Fedify の PostgreSQL queue を drain し、empty であることを運用者が確認する。stale queue row は移行しない。
3. 秘密情報を表示しない runner で、リポジトリ外に mode `0700` の作業ディレクトリを作る。
4. 作業ディレクトリ、`UPLOAD_DIR` のコピー、各 manifest が Git top-level 配下でないことを確認する。

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

## 検証と cutover

`cloudflare:verify:import` は export、変換後の D1 import、upload、OGP manifest から expected state を作り、repository-owned provider contract を通じて actual state を比較する。`IORI_D1_IMPORT_MANIFEST` は `cloudflare:convert:d1` が外部の mode `0600` ディレクトリへ生成する manifest を指し、そこに PostgreSQL の時刻と JSON を D1 表現へ変換した canonical per-table checksum と row count を保持する。production runner は repository 外の `IORI_IMPORT_RUNNER` module で `getTableSummaries(tableNames)`、`getObject(key)`、`listObjects(prefix, cursor?)` を実装する。前者は同じ canonical D1 row 表現の count/checksum を返し、`getObject` は R2 object の bytes/HTTP metadata を返し、`listObjects` は指定 prefix の bounded page（`{ keys, cursor? }`）を返す。runner は Cloudflare のページングを完了させず、cursor がなくなるまで検証側がページを順に取得する。検証は expected key だけでなく list 結果の余分な key、重複、未進行 cursor も検出し、listing API がない/不正なら fail closed する。Wrangler の upload が生成する `<expected-key>.metadata.json` sidecar だけは object 本体との比較から除外し、任意の metadata key は余分な object として失敗させる。ページは最大 1,000 key、検証は最大 100,000 page/ key を受け付け、上限超過も fail closed する。CLI は runner を import するだけで、runner の接続設定・credential・actual data は出力しない。table count と checksum、R2 object、公開 article の OGP object に不一致があれば non-zero で終了する。出力は `table=<name> expected=<count> actual=<count>`、checksum mismatch、R2/OGP の aggregate missing count のみであり、row、token、URL、object identifier、SQL を出力しない。

verification、health check、sign-in、upload、timeline、ActivityPub delivery を確認してから DNS/route を切り替える。Lightsail は確認が終わるまで read-only と backup を保持する。
