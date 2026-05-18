# slack-thread-expander の GAS 移植設計

- 日付: 2026-05-18
- 対象元実装: <https://github.com/eagletmt/slack-thread-expander>
- 配置先: `apps/slack-thread-expander`

## 背景

元実装 (Rust) は Slack の Socket Mode で `message.channels` イベントを受信し、
スレッド返信（`thread_ts` 有り、ブロードキャストではない）を検出して即時に permalink を本流チャンネルに投稿することで、
「Also send to channel」を使わずにスレッドの内容をチャンネルに展開している。

これを **Google Apps Script (GAS)** に移植する。
要件として、新規 Slack App を作るのは最小限にとどめ、サーバ常駐や WebSocket 公開も避けたい。

## 制約と決定

| 論点           | 決定                                             | 理由                                                                                  |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 通信方式       | 1 分毎の時間トリガー + `conversations.history`   | GAS は WebSocket を扱えず Socket Mode 不可。Events API 公開も避けたい                 |
| 対象チャンネル | Script Properties `TARGET_CHANNELS` に明示       | Bot 全参加チャンネルを舐めると `conversations.history` (Tier 3: 50req/min) を圧迫する |
| カーソル管理   | チャンネル別 `LAST_TS_<channel>` を Script Props | シンプル。初回は `now()` で初期化（過去遡及なし）                                     |
| 開発スタイル   | TypeScript + esbuild バンドル + clasp push       | monorepo の他パッケージと型/テストワークフローを揃える                                |
| 配置場所       | `apps/slack-thread-expander`                     | pnpm workspace のメンバーとして lint/format/test を統一                               |

## アーキテクチャ

```
[Time Trigger 1min] ──▶ main()
                          │
                          ├─ ScriptProperties.TARGET_CHANNELS を読み込み
                          ├─ LockService.tryLock(0)  # 直前ジョブが残っていればスキップ
                          └─ for each channelId:
                               1. conversations.history(oldest=last_ts[ch])
                               2. messages.filter(findThreadedReply)
                               3. for each reply:
                                    chat.getPermalink → chat.postMessage(channel, permalink)
                               4. ScriptProperties.LAST_TS_<ch> = max(ts)
```

## コンポーネント

```
src/
├── index.ts                  # GAS が呼ぶグローバル関数を集約 export
├── main.ts                   # main / installTrigger / uninstallTrigger
├── runner.ts                 # expandChannel(client, channel, selfBotId): ExpandSummary
├── config.ts                 # Script Properties wrapper (loadConfig, getLastTs, setLastTs)
├── domain/
│   └── threaded-reply.ts     # findThreadedReply (純粋関数), isOwnPost
└── slack/
    ├── client.ts             # UrlFetchApp ラッパ (callSlack)
    ├── conversations.ts      # conversationsHistory
    ├── chat.ts               # chatGetPermalink, chatPostMessage
    └── schema.ts             # zod スキーマと型
test/
├── threaded-reply.test.ts    # 元実装の fixtures で等価性検証
└── fixtures/                 # eagletmt/slack-thread-expander の testdata をコピー
scripts/build.mjs             # esbuild で dist/Code.js を生成 (IIFE + global 関数露出)
```

ドメイン層 (`findThreadedReply`) は I/O 非依存の純粋関数で、Slack API ラッパとは独立にテストする。
GAS の `UrlFetchApp` 依存は `src/slack/client.ts` の `callSlack` に閉じ込める。

## スレッド返信の判定ロジック

元実装の `find_threaded_message` と等価:

```ts
findThreadedReply(channel, message):
  if message.thread_ts == null → null              # スレッド外
  if message.thread_ts === message.ts → null       # スレッド親自身
  if message.subtype && subtype !== 'file_share' → null
    # message_changed, thread_broadcast, channel_join 等を除外
  return { channel, ts: message.ts }
```

Bot 自身が投稿した permalink を再展開しないためのガード `isOwnPost(message, selfBotId)` を併設するが、
permalink 投稿には `thread_ts` が付かないので通常は `findThreadedReply` 段で除外される。
保険として `SELF_BOT_ID` を Script Properties に登録できる。

## エラーハンドリング

- ドメイン層は `Result<T, SlackApiError>` で返却（@iwasa-kosui/result）
- `SlackApiError` は discriminated union: `http | slack | parse | network`
- 1 チャンネルの失敗が他チャンネルを止めないよう、`main` が `try/catch` で囲む
- メッセージ展開中の失敗時は `break` してそのメッセージの ts でカーソルを止め、次回 tick で再試行
- 部分進捗を許容（成功したメッセージ分はカーソルを進める）

## カーソルの取り扱い

- 初回起動時: `LAST_TS_<channel>` が未設定なら `nowAsSlackTs()` で初期化し、その tick は何も処理しない
- 通常時: `conversations.history(oldest=last_ts, inclusive=false, limit=200)` で取得
- 取得後: ts 昇順にソートして処理し、各メッセージ処理後に `LAST_TS_<channel>` を最大 ts に更新
- 失敗時: 失敗メッセージで停止し、それ以降のメッセージはカーソルを進めない

## テスト

vitest で以下を検証（元実装の Rust テストと 1:1 対応）:

| ケース                               | 期待                            |
| ------------------------------------ | ------------------------------- |
| plain_message                        | null                            |
| threaded_message                     | `{channel, ts: '1644939337…'}`  |
| threaded_message_changed             | null (subtype=message_changed)  |
| broadcasted_threaded_message         | null (subtype=thread_broadcast) |
| broadcasted_threaded_message_changed | null                            |
| threaded_file_upload                 | `{channel, ts: '1644940789…'}`  |
| broadcasted_threaded_file_upload     | null                            |

Slack クライアントは UrlFetchApp 依存のため統合テストは行わず、GAS Editor 上の手動実行で動作確認する。

## デプロイ

**通常運用は GitHub Actions による CI デプロイ**。
`.github/workflows/deploy-slack-thread-expander.yml` が `main` への push をトリガーに
tsc → test → build → `clasp push -f` を実行する。

初回のみ手動セットアップ:

1. `pnpm install && pnpm exec clasp login --no-localhost && pnpm exec clasp create --type standalone --rootDir ./dist`
2. 生成された `~/.clasprc.json` と `apps/slack-thread-expander/.clasp.json` を Secret に登録:
   - `SLACK_THREAD_EXPANDER_CLASPRC_JSON`
   - `SLACK_THREAD_EXPANDER_CLASP_JSON`
3. Slack App を `app_manifest.yml` から作成 → Bot Token を取得
4. GAS Editor の Script Properties に `SLACK_BOT_TOKEN`, `TARGET_CHANNELS`, 任意で `SELF_BOT_ID` を設定
5. main にマージ → CI が `clasp push` 実行
6. GAS Editor で `installTrigger` を 1 度手動実行 → 1 分毎の `main` トリガー登録

### CI ワークフローの設計

- トリガー: `apps/slack-thread-expander/**`, `packages/result/**`, ワークフロー自身, `pnpm-lock.yaml` の変更
- 手動キック: `workflow_dispatch`
- 並行制御: `concurrency.group: deploy-slack-thread-expander`, `cancel-in-progress: false`（push 競合を避ける）
- ジョブ: install → result build → tsc → test → build → secret 復元 → `clasp push -f`
- Secret 未設定時は `::error::` で fail-fast

## 元実装との差分まとめ

| 観点           | 元実装 (Rust)                     | 本実装 (GAS)                           |
| -------------- | --------------------------------- | -------------------------------------- |
| 通信方式       | Socket Mode (WebSocket)           | 時間トリガー + `conversations.history` |
| 遅延           | 即時                              | 最大 1 分                              |
| 必要トークン   | App-Level Token + Bot OAuth Token | Bot OAuth Token のみ                   |
| 対象チャンネル | Bot が参加した全チャンネル        | `TARGET_CHANNELS` に明示               |
| 状態管理       | なし                              | チャンネル別 `LAST_TS_<channel>`       |
| デプロイ       | バイナリ常駐                      | clasp push + 時間トリガー              |
