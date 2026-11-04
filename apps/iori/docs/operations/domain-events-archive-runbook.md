# domain_events の R2 退避 runbook

`iori` の D1 にある `domain_events` テーブルは、イベントが増え続けます。Worker は、7日より古い行を R2 に Parquet で退避し、退避した行を D1 から削除します。この runbook は、退避の仕組み、有効化の手順、件数の確認、退避したファイルの読み方を定めます。

## 1. 退避の仕組み

- Worker は、毎日 19:00 UTC に cron（`0 19 * * *`）で退避の処理を実行します。この処理は、`occurredAt` が実行時刻の7日前より古い行だけを対象にします。
- Worker は、行を `occurredAt` の古い順に最大 5,000 件ずつ取り出します。Worker は、`aggregate_state`、`event_payload`、`aggregate_id` の長さの累計が 16 MB（16 * 1024 * 1024）に達する手前で、取り出しを打ち切ります。先頭の1行は、16 MB を超えていても必ず取り出します。
- 1回の書き出しには、同じ UTC 日の行だけを入れます。
- Worker は、R2 への書き出しが成功した後に、書き出した範囲の行を D1 から削除します。書き出しに失敗した場合、Worker は D1 から行を削除しません。
- Worker は、actor の作成のイベント（`actor.created`）を D1 に残します。この行は、退避の対象にも削除の対象にもなりません。
- Worker は、秘密情報を含むイベント（鍵の作成、プッシュ購読の作成など）について、`aggregate_state` と `event_payload` の列を NULL にして書き出します。
- Worker は、各バッチの書き出しと削除が終わるたびに、オブジェクトの鍵と件数を1行のログに出します。
- 1回の実行には、10分の時間の上限と、100バッチの上限があります。どちらかの上限に達した場合、残りの行は翌日の実行で退避します。

退避したファイルは、専用の R2 バケット `iori-<環境>-<世代>-event-archive` に置きます。このバケットは非公開です。公開アクセスもカスタムドメインも設定せず、期限での削除（ライフサイクル）も設定しません。ファイルは無期限で残ります。

オブジェクトの鍵は、次の形です。

```text
domain-events/v1/year=YYYY/month=MM/day=DD/<occurredAt>-<eventId>.parquet
```

- `YYYY`、`MM`、`DD` は、書き出した行の UTC 日付です。`<occurredAt>` と `<eventId>` は、そのファイルの先頭の行の値です。
- Worker は、同じ範囲を再実行した場合に、同じ鍵へ上書きします。書き出しの後、D1 の削除の前に失敗しても、次の実行は同じ鍵に同じ内容を書き直して、やり直せます。
- 同じイベントが複数のファイルに入る場合があります。読み取り側は、`event_id` で重複を除きます。

Parquet の列は、`event_id`、`aggregate_id`、`aggregate_name`、`aggregate_state`、`event_name`、`event_payload`、`occurred_at` です。

機微な列のうち、`session.started` の `aggregate_id` は、元の値を `sha256:<16進>` に置き換えて書きます。

## 2. 有効化の手順

退避の処理は、環境変数 `EVENT_ARCHIVE_ENABLED` が文字列の `true` のときだけ動きます。`apps/iori/workers/iori/wrangler.template.jsonc` の既定値は `"false"` です。最初の配備は、無効のまま行います。

1. 作業者は、Terraform で R2 バケットを作ります。`apps/iori/infra/cloudflare` で `terraform apply` を実行し、`cloudflare_r2_bucket.event_archive` が作られたことを確かめます。作業者は、Terraform の API token に R2 バケットを作る権限があることを、先に確かめます。
2. 作業者は、`deploy-worker` の operation を dispatch して、無効のまま Worker を配備します。この配備は、`EVENT_ARCHIVE` の R2 バインディングと、`0 19 * * *` の cron を Worker に反映します。`deploy-worker` は、`iori-<環境>-<世代>-event-archive` がないと、バケットの確認で止まります。
3. 作業者は、後述の `domain-events-stats` を実行して、退避前の件数を記録します。作業者は、次の2点も確かめます。
   - `max_bytes` と `avg_bytes` が、バイトの予算 16 MB に対して十分に小さいことを確かめます。`max_bytes` が 16 MB に近い場合、作業者は有効化を止めて、原因を調べます。
   - `created_at_skew_actors` が 0 であることを確かめます。この値は、`actor.created` のイベントより古いイベントを持つ actor、または `actor.created` のイベントを持たない actor の数です。0 でない場合、退避の後にアカウントの作成日時（`createdAt`）が、現在の値からずれます。作業者は、有効化を止めて、原因を調べます。
4. 作業者は、`wrangler.template.jsonc` の `EVENT_ARCHIVE_ENABLED` を `"true"` に変える PR を作ります。レビューを受けて main に merge した後、`deploy-worker` を dispatch して配備します。
5. 作業者は、翌日の 19:00 UTC より後に `domain-events-stats` を再実行します。`older_than_7d` が減ったことを確かめます。作業者は、次の2つの方法で、R2 にオブジェクトが増えたことも確かめます。
   - Cloudflare ダッシュボードの「R2 オブジェクト ストレージ」を開き、バケット `iori-<環境>-<世代>-event-archive` を選びます。作業者は、「オブジェクト」の画面で `domain-events/` を開き、`v1/` の下に `year=`、`month=`、`day=` の順でフォルダが増えていることを確かめます。
   - Cloudflare ダッシュボードの「Workers & Pages」で Worker `iori-<環境>-<世代>` を開き、「Observability」の「ログ」を選びます。作業者は、時間の範囲を実行時刻（19:00 UTC）の前後に絞り、`iori domain events archive: batch archived.` を検索します。各ログの `key` と `count` が、バッチごとのオブジェクトの鍵と件数です。最後に `iori domain events archived.` のログが出れば、その実行は終わっています。

退避を止める場合は、`EVENT_ARCHIVE_ENABLED` を `"false"` に戻す PR を作り、`deploy-worker` を dispatch します。R2 のファイルと、D1 から削除済みの行は、元に戻りません。

## 3. domain-events-stats で件数を確認する

`domain-events-stats` は、本番の D1 に SELECT だけを送る operation です。この operation は、行を書き換えません。

作業者は、GitHub Actions の `Deploy iori Worker` を次の入力で dispatch します。

- `operation`: `domain-events-stats`
- `environment`: `production`
- `main_sha`: 最新の main の SHA
- `generation`: 対象の D1 の世代
- `migration_run_id`、`recovery`、`repost_created_before_ms`: 空

この operation は、公開ログに `IORI_NOTICE domain-events-stats ...` の行を出します。出力の内容は、次のとおりです。

- `summary` の行: 総件数（`total`）、最古と最新の `occurredAt`（`oldest`、`newest`）、7日より古い件数（`older_than_7d`）、1行の平均と最大のサイズ（`avg_bytes`、`max_bytes`）、`createdAt` がずれる actor の数（`created_at_skew_actors`）。サイズは、各列の UTF-8 のバイト数を足した概算です。
- `day=YYYY-MM-DD count=<N>` の行: 直近 30 日の UTC 日別の件数。
- `event=<eventName> count=<N>` の行: `eventName` 別の件数の上位 30。

この operation は、結果の全体を JSON にして標準出力へも書きます。標準出力は、job の非公開ログに残り、job の終了時に消えます。

## 4. DuckDB で退避したファイルを読む

作業者は、DuckDB の `httpfs` 拡張から、R2 の S3 互換 API を使って Parquet を読みます。

### 読み取り専用の token を作る

1. 作業者は、Cloudflare ダッシュボードの R2 の「API トークンを管理」を開き、「API トークンを作成」を選びます。
2. 作業者は、権限を「オブジェクトの読み取りのみ」にします。対象は、退避用のバケット `iori-<環境>-<世代>-event-archive` だけに絞ります。
3. 作業者は、表示された Access Key ID と Secret Access Key を、パスワードマネージャーなどの安全な保管元に保存します。この値は、リポジトリ、Issue、PR、チャットに貼りません。
4. 作業者は、S3 互換 API のエンドポイント `https://<アカウント ID>.r2.cloudflarestorage.com` の `<アカウント ID>` を控えます。

### 読み取りの手順

DuckDB の対話シェルに、次の SQL を入力します。`<...>` の部分は、作業者が自分の値に置き換えます。値はシェルの履歴やファイルに残さないでください。

```sql
INSTALL httpfs;
LOAD httpfs;

CREATE SECRET iori_archive (
  TYPE r2,
  KEY_ID '<Access Key ID>',
  SECRET '<Secret Access Key>',
  ACCOUNT_ID '<アカウント ID>'
);

SELECT event_name, count(*) AS n
FROM read_parquet('r2://<バケット>/domain-events/v1/**/*.parquet', hive_partitioning = true)
GROUP BY event_name
ORDER BY n DESC;
```

`hive_partitioning = true` を指定すると、鍵の `year=`、`month=`、`day=` が列として読めます。期間を絞るときは、`WHERE year = 2026 AND month = 11` のように、この列を条件にします。

同じイベントが複数のファイルに入る場合があるので、集計の前に `event_id` で重複を除きます。

```sql
SELECT *
FROM read_parquet('r2://<バケット>/domain-events/v1/**/*.parquet', hive_partitioning = true)
QUALIFY row_number() OVER (PARTITION BY event_id ORDER BY occurred_at) = 1;
```

D1 に残っているイベント（7日以内の行と、`actor.created`）は、R2 にありません。全期間を見る場合は、R2 の結果と D1 の結果を、作業者が合わせて確認します。
