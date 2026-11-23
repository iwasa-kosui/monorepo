# 媒体に依存しないコンテンツ設計

## 背景

iori は Cloudflare Workers、D1、R2、Queue、Fedify で動作する個人向けの SNS サーバーである。ActivityPub に対応し、Bluesky へは既存アカウントに app password でログインして XRPC で投稿する。iori は自前の PDS を持たない。

現状の構造は、ActivityPub のサーバーに Bluesky を別系統として追加したものである。以下に、配信、取り込み、ドメインイベント、実装の系統の4点について現状を示す。パスは `apps/iori/src` からの相対パスである。

### 配信の現状

本文の正本は HTML の `posts.content` である。Bluesky へは送信時に text と facets へ変換する（`useCase/sendBlueskyCrosspost.ts:131`）。

ユースケースの `createPost`、`sendReply`、`deletePost` は、配信を直接呼び出す。呼び出す順序は、ActivityPub、リレー、Bluesky である。根拠は `useCase/createPost.ts:158-222` である。

配信状態を記録するのは Bluesky だけであり、記録先は `bluesky_crossposts` である。ActivityPub の再試行は Fedify の Queue に任せ、iori は宛先ごとの成否を記録しない。リレーへの配信が失敗した場合、iori は警告ログを出力するだけである（`useCase/createPost.ts:212-214`）。

Bluesky への送信は `waitUntil` で実行する。送信に失敗した場合は、3時間ごとの cron が再試行する。投稿の本文を編集する機能はない。

### 取り込みの現状

毎分の cron が、Bluesky のいいね、リポスト、リプライを通知 API の `app.bsky.notification.listNotifications` から取得する。iori はこれらを通知としてだけ保存する。

投稿の反応数は `likes`、`reposts`、`emoji_reacts` を集計した値であり、Bluesky の反応を含まない。根拠は `adaptor/d1/post/postWithAuthorBatch.ts:76-96` である。

スレッドは `inReplyToUri` を辿って組み立てる。このため、スレッドは Bluesky のリプライを含まない。根拠は `adaptor/d1/post/threadResolver.ts:47-95` である。

リプライの参照は2つの体系に分かれている。ActivityPub の URI は、次の2列に保存する。

- `local_posts.inReplyToUri`
- `remote_posts.inReplyToUri`

at-uri は `bluesky_timeline_items.replyParentUri` に保存する。

`actors.inboxUrl` は NOT NULL かつ一意である（`adaptor/d1/schema.ts:43`）。このため Bluesky のアカウントを `actors` に登録できない。iori は DID と handle の文字列を、`bluesky_timeline_items` と `notification_bluesky` に複製している。

Bluesky の投稿は `posts` ではなく、30日保持の `bluesky_timeline_items` に保存する。この結果、いいねとリポストのユースケース、API、UI のフックが媒体ごとに並行して実装されている。ホームタイムラインは、UI が2つの API の結果を合成して表示する（`ui/hooks/useTimeline.ts:122-187`）。

通知は種類ごとに1テーブルを持つ。テーブルは次の6つである。

- `notification_likes`
- `notification_follows`
- `notification_reposts`
- `notification_emoji_reacts`
- `notification_replies`
- `notification_bluesky`

### ドメインイベントの現状

各ストアは、同一のバッチで `domain_events` の行と射影テーブルの行を書く。リゾルバーは射影テーブルを読み、イベントから状態を再構築しない。

`domain_events` の列は次の7つである。根拠は `adaptor/d1/schema.ts:26-37` である。

- `eventId`
- `aggregateId`
- `aggregateName`
- `aggregateState`
- `eventName`
- `eventPayload`
- `occurredAt`

`aggregateState` は変更後の集約の全体を JSON で持ち、削除イベントでは NULL である。

順序を決める列は `occurredAt` と `eventId` だけである。同一ミリ秒のイベントの順序は UUID の辞書順で決まり、発生順と一致するとは限らない。イベントの版を表す列はない。

7日を過ぎたイベントを Parquet に変換して R2 に保存し、D1 から削除する処理が実装済みである。Parquet の圧縮は SNAPPY で、書き出しには `hyparquet-writer` を使う。根拠は `useCase/archiveDomainEvents.ts` と `domain/domainEvent/domainEventArchive.ts` である。処理は環境変数 `EVENT_ARCHIVE_ENABLED` が `"true"` のときだけ動作する。テンプレートの既定値は `"false"` である。R2 のキーは UTC の日で分割する。

現行の Parquet だけでは状態を復元できない。理由は5つある。

- Parquet を読み戻して射影テーブルを再構築する処理がない。
- 鍵、セッション、トークン、パスキーのイベントは、`aggregate_state` と `event_payload` を NULL にして書き出す。根拠は `domain/domainEvent/domainEventArchive.ts:14-35` である。
- 登録済みの一覧にないイベント名も NULL にして書き出し、警告ログを出力するだけである（`domain/domainEvent/domainEventArchive.ts:209-212`）。
- `actor.created` は D1 に残し、Parquet に書き出さない。
- ドメインイベントを書かずに、テーブルだけを更新するストアがある。該当するストアは次のとおりである。
  - Bluesky の配信状態（`adaptor/d1/blueskyCrosspost/`）
  - Bluesky のタイムライン、いいね、リポスト（`adaptor/d1/blueskyTimeline/`）
  - 投稿の画像（`adaptor/d1/image/postImageCreatedStore.ts`）
  - リンクプレビュー（`adaptor/d1/linkPreview/`）
  - リモートの投稿の定期削除（`adaptor/d1/post/remotePostsPrunedStore.ts`）

### 実装の系統の現状

スキーマと inbox のハンドラは2系統ある。1つは Workers と D1 の系統であり、`adaptor/d1` と `federation.cloudflare.ts` が該当する。もう1つは Node と PostgreSQL の系統であり、`adaptor/pg` と `federation.ts` が該当する。Bluesky のテーブルは D1 の系統にだけある。PostgreSQL の系統が本番で使われているかは未確認である。

## 目標と非目標

### 目標

1. コンテンツを媒体に依存しない形式で保持し、各媒体へ配信する。配信先を追加するときに、ユースケースを変更しない。
2. 投稿への反応とリプライを、取り込み元の媒体を問わず、同じ反応数と同じスレッドに表示する。
3. ドメインイベントを Parquet で永続化し、Parquet と D1 に残るイベントから、復元対象のテーブルを再構築できるようにする。

### 非目標

- 投稿の本文を編集する機能。
- 同一人物が複数の媒体に持つアカウントの統合。
- Jetstream による Bluesky のプッシュ型の取り込み。常時接続が必要であり、Workers では Durable Objects の導入が前提になる。
- 鍵、セッション、トークン、パスキーの Parquet からの復元。これらのイベントは、現行と同じく内容を NULL にして書き出す。
- RSS ダイジェスト、AI の利用回数、OAuth、Web Push など、投稿と反応に関係しない機能のテーブルの見直し。

## 設計

### 全体の構造

中核のモデルである投稿者、投稿、反応、通知から、媒体の識別子を除外する。媒体との対応は「外部参照」と「配信」の2種類のテーブルに集約する。媒体ごとの処理は、取り込みアダプターと配信アダプターに置く。

```
            ┌────────── 中核（媒体に依存しない） ──────────┐
 書く ───▶ │ posts / actors / reactions / notifications │ ───▶ 表示
            └───────▲───────────────────────┬────────────┘
        取り込み    │                       │ ドメインイベント
                    │                       ▼
                    │                  deliveries
            ┌───────┴───────┐        ┌──────┴────────┐
            │ ActivityPub   │        │ ActivityPub   │
            │ Bluesky       │        │ Bluesky       │
            └───────────────┘        └───────────────┘
              取り込みアダプター        配信アダプター
```

### データモデル

| テーブル | 役割 |
|---|---|
| `actors` | 投稿者。媒体の列を持たない |
| `actor_identities` | 投稿者と媒体上の識別子の対応 |
| `posts` | 投稿。本文は媒体に依存しない形式 |
| `post_references` | 投稿と媒体上の識別子の対応 |
| `deliveries` | 配信先ごとの配信状態 |
| `reactions` | いいね、リポスト、絵文字リアクション |
| `notifications` | 通知。種類によらず1テーブル |

#### 各テーブルが置き換えるもの

`actors` は、現行の `actors.uri` と `actors.inboxUrl` を置き換える。

`actor_identities` は、媒体の種別を持つ。ActivityPub の識別子は URI と inbox を持ち、Bluesky の識別子は DID と handle を持つ。現行の `remote_actors` の一部と、各テーブルに複製した DID と handle を置き換える。

`posts` は、リプライ先を内部の `postId` で参照する。列名は `replyToPostId` とする。現行の `inReplyToUri` と `bluesky_timeline_items` を置き換える。

`post_references` は、媒体の種別、URI、cid を持つ。リモートの投稿は、取り込み元の1行を持つ。自分の投稿は、配信先ごとに1行を持つ。現行の `remote_posts.uri` と、`bluesky_crossposts` の `uri` と `cid` を置き換える。

`deliveries` は、投稿、配信先、操作の組ごとに、配信状態、試行回数、エラーを持つ。操作は作成と削除である。現行の `bluesky_crossposts` の状態の列を置き換える。

`reactions` は、媒体の種別と外部の URI を列として持つ。現行の `likes`、`local_likes`、`remote_likes`、`reposts`、`emoji_reacts`、`bluesky_likes`、`bluesky_reposts` を置き換える。

`notifications` は、種類、行為者の `actorId`、対象の `postId` または反応の ID を持つ。現行の `notification_*` のテーブルを置き換える。

#### この構造での実現方法

投稿の反応数は、`reactions` を `postId` で集計した値である。集計の条件に媒体を含めない。

スレッドは `posts.replyToPostId` を辿って組み立てる。Bluesky のリプライも `posts` の行として保存する。

取り込みアダプターは、`post_references` を検索して、媒体の URI から内部の `postId` を取得する。リプライ先の投稿が未取り込みの場合の扱いは、未解決点に書く。

### 本文の形式

本文は、プレーンテキストと注釈で保持する。注釈は、リンク、メンション、ハッシュタグの範囲である。ActivityPub の配信アダプターは本文を HTML に変換し、Bluesky の配信アダプターは facets に変換する。ActivityPub から取り込む HTML は、取り込みアダプターがこの形式へ変換する。変換できない HTML の要素の扱いは、未解決点に書く。

### 配信

ユースケースは、投稿を保存してドメインイベントを発行する。ユースケースは配信を呼び出さない。

イベントの購読者が、配信先ごとに `deliveries` の行を作成する。Queue のコンシューマーが、媒体ごとの配信アダプターを呼び出す。配信アダプターのインターフェースは、作成と削除の2操作である。配信に成功したとき、配信アダプターは媒体上の識別子を `post_references` に登録する。

次の投稿は Bluesky へ配信しない。CW とセンシティブ指定の投稿、および返信先が Bluesky に未送信の投稿である。この判定は現行の `domain/blueskyCrosspost/blueskyCrosspost.ts:132-139` にあり、Bluesky の配信アダプターに移動する。配信しない場合も、理由を `deliveries` に記録する。

リレーへの配信も `deliveries` に記録する。ActivityPub の宛先 inbox ごとの成否は、引き続き Fedify の Queue が管理する。`deliveries` が記録する単位は、Fedify の Queue への登録までである。

### 取り込み

媒体ごとの取り込みアダプターが、媒体の形式を中核のコマンドに変換する。コマンドは次の4つである。

- リモートの投稿を登録する。
- 反応を登録する。
- 反応を取り消す。
- リモートの投稿を削除する。

ActivityPub の inbox のハンドラと Bluesky のポーリングは、同じコマンドを呼び出す。

Bluesky は、現行の通知 API のポーリングを継続する。取り込みアダプターは、取得した like と repost を `reactions` に、reply を `posts` に登録する。

通知 API は、いいねとリポストの取り消しを返さない。取り込みアダプターは、`app.bsky.feed.getLikes` と `app.bsky.feed.getRepostedBy` で定期的に照合し、取り消しを検出する。照合の頻度と対象の範囲は、未解決点に書く。

Bluesky のホームタイムラインの投稿も `posts` に登録し、`bluesky_timeline_items` を廃止する。ホームタイムラインは、サーバー側の1つのクエリで取得する。反応とリプライのどちらの対象にもなっていないリモートの投稿は、現行と同じ30日で削除する。

### 自分からの反応

いいね、リポスト、リプライのユースケースは、媒体ごとの並行実装を廃止して1つに統合する。ユースケースは `reactions` または `posts` に保存し、ドメインイベントを発行する。配信の購読者は、対象の投稿の `post_references` を参照して、送信先の媒体を決定する。

### イベントの永続化と復元

ドメインイベントを正本とする。復元対象のテーブルは、イベントから再構築できる射影である。復元対象は、投稿者、投稿、外部参照、配信、反応、フォロー、通知、投稿の画像、リンクプレビューである。鍵、セッション、トークン、パスキーは復元対象に含めない。

Parquet のファイル形式、圧縮、R2 のキーの分割単位、書き出しと削除の順序は現行を維持する。以下の変更を加える。

#### すべての更新をイベントとして書く

復元対象のテーブルを更新するすべてのストアが、ドメインイベントを書く。背景に挙げたストアのうち、復元対象に該当するものを変更する。リモートの投稿の定期削除も、削除イベントを書く。

`actor.created` も Parquet に書き出す。D1 の行は現行と同じく残す。

#### 順序と版を列として持つ

`domain_events` に、全体の発生順を表す連番の列と、イベントの版を表す列を追加する。Parquet にも同じ2列を追加する。再生の順序は連番で決める。

イベントの形式を変更するときは版を上げ、旧い版のイベントを現行の版へ変換する処理を追加する。復元の処理は、この変換を通してから射影を適用する。

#### イベント名の分類を必須にする

イベント名の分類は、内容を書き出すか、内容を NULL にするかの2種類である。この分類を、すべてのイベント名について必須にする。分類のないイベント名があるとテストが失敗するようにし、未登録のイベントが NULL で書き出される状態を防止する。

#### 射影の適用を共通化する

ストアの処理を、イベントの追記と射影の適用に分離する。射影の適用は、集約の状態をテーブルの行に変換して upsert する処理である。状態が NULL のイベントでは、行を削除する。ストアと復元の処理は、同じ射影の適用を使う。

#### 復元の処理

復元の処理は、R2 の Parquet と D1 に残るイベントを読み、`event_id` で重複を除外し、連番の順に射影を適用する。`aggregateState` が変更後の集約の全体を持つので、復元の処理は集約ごとに最後のイベントを適用すればよい。

復元の処理は Worker の外で実行するスクリプトとする。Worker の実行時間の制限を受けないためである。

復元のリハーサルを定期的に実施する。空の D1 に復元し、復元対象のテーブルの行数と内容を本番と比較する。

#### 基準となるイベントの発行

移行の開始時に、現在のテーブルの内容から、集約ごとに基準となるイベントを1件発行する。過去のイベントには欠落があり、過去のイベントだけでは現在の状態を再構築できないためである。欠落は、NULL で書き出したイベントと、イベントを書かなかったストアの変更である。

### 移行の段階

段階的に移行する。各段階は単独でリリースできる。

1. Node と PostgreSQL の系統を削除する。本番で使用していないことの確認が前提である。
2. イベントの永続化と復元の基盤を導入する。前節の変更をすべて含む。
3. `post_references` と `deliveries` を追加し、配信をイベントの購読者に移動する。
4. `reactions` に統合し、Bluesky のいいねとリポストを取り込む。この段階の完了時点で、Bluesky の反応が投稿の反応数に含まれる。
5. Bluesky のリプライを `posts` に取り込み、スレッドを `replyToPostId` で組み立てる。
6. 本文の形式を変更する。
7. Bluesky のタイムラインを `posts` に統合し、`bluesky_timeline_items` と媒体別の API、UI のフックを削除する。
8. 通知を1つのテーブルに統合する。

## 代替案

### HTML を本文の正本として維持する案

採用しない。Bluesky への変換で情報が欠落する。媒体を追加するたびに、HTML からの変換を追加する必要がある。

### Bluesky のタイムラインを統合せず、反応とリプライだけを統合する案

採用しない。Bluesky の投稿は `posts` の行を持たない状態のままになり、いいね、リポスト、リプライのユースケースを統合できない。

### 一度に全体を移行する案

採用しない。途中の状態でリリースできず、不具合の原因の特定が困難になる。

### 現行のテーブルに媒体の列を追加する案

`likes` に Bluesky の URI の列を追加する方法である。採用しない。媒体を追加するたびに中核のテーブルの列が増え、媒体による分岐がユースケース層に残る。

### D1 のバックアップだけを復元の手段とする案

採用しない。バックアップは時点の状態だけを保持し、変更の履歴を保持しない。スキーマを変更したあとの再構築にも使用できない。

## 影響

Mastodon 互換 API と UI は、媒体別のエンドポイントとフックを削除し、統合後のクエリを使用する。

`.claude/rules/domain-model-iori.md` の集約の一覧を更新する必要がある。`apps/iori/docs/operations/domain-events-archive-runbook.md` の復元の記述も更新する必要がある。

リモートの投稿の取り込みと定期削除がイベントを書くので、`domain_events` と Parquet の量が増加する。

## リスク

### 書き込み量の増加

Bluesky のホームタイムラインの取り込みは、毎分、最大5ページ、1ページ100件である。すべての投稿がイベントを書くと、D1 の書き込み量と Parquet の量が増加する。

### 重複した表示

同一人物が ActivityPub と Bluesky の両方から反応した場合、反応数は2件になる。ブリッジ（Bridgy Fed など）を経由して同じリプライが両方の媒体から届いた場合、スレッドに同じ内容のリプライが2件表示される。非目標に挙げたとおり、iori は同一人物のアカウントを統合しない。

### 取り消しの検出の遅延

通知 API からの取り込みでは、いいねとリポストの取り消しの検出が、照合の周期だけ遅れる。

### 鍵の復元

鍵、セッション、トークン、パスキーは Parquet から復元できない。復元後は、鍵の再生成か、別の手段での復元が必要になる。ActivityPub の署名鍵を再生成した場合に、フォロワーのサーバーへ与える影響は未確認である。

## 未解決点

- Node と PostgreSQL の系統が、本番で使用されているか。
- 本番で `EVENT_ARCHIVE_ENABLED` が `"true"` か。R2 に保存済みの Parquet の量はどれだけか。
- リプライ先の投稿が未取り込みの場合に、取り込みアダプターがリプライ先を取得するか、リプライ先を持たない投稿として登録するか。
- ActivityPub から取り込む HTML のうち、本文の形式で表現できない要素の扱い。該当する要素は、引用、リスト、強調などである。
- Bluesky のいいねとリポストの取り消しを照合する頻度と、照合の対象とする投稿の範囲。
- タイムラインにだけ表示するリモートの投稿を、イベントを書く対象に含めるか。この投稿は、反応とリプライのどちらの対象にもなっていない投稿である。
- 鍵の復元の手段。
- 投稿の編集を将来追加する場合は、`deliveries` の操作に「更新」を追加する。
