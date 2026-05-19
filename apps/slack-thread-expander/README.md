# slack-thread-expander (GAS)

[eagletmt/slack-thread-expander](https://github.com/eagletmt/slack-thread-expander) を Google Apps Script に移植した実装。
スレッド返信を「Also send to channel」なしでチャンネル本流に展開する。

元実装は Slack Socket Mode で即時にスレッド返信を検出して permalink を投稿していたが、
GAS は WebSocket を扱えないため、**1 分毎の時間トリガーで `search.messages` をポーリングする方式** に切り替えている。

`conversations.history` ではスレッド返信本体（`Also send to channel` なし）は取得できないため、
User Token で `search.messages` を呼び、レスポンス中の `permalink` を Bot Token から投稿する 2 トークン構成。
検索インデックスの反映遅延があるため、投稿〜展開までの遅延は最大 1 分 + 数秒〜数十秒程度を見込む。

## アーキテクチャ

```
[Time Trigger 1min] ──▶ main()
                          │
                          ├─ ScriptProperties.TARGET_CHANNELS を読み込み
                          ├─ LockService で排他
                          └─ for each channelId:
                               1. conversations.info(user token) でチャンネル名解決
                               2. search.messages(user token, "in:<name> after:<date>")
                               3. matches.filter(ts > last_ts && findThreadedReply)
                               4. for each reply:
                                    chat.postMessage(bot token, channel, match.permalink)
                               5. ScriptProperties.LAST_TS_<ch> = max(ts)
```

スレッド返信判定は `MessageClassification.classify` (`src/domain/message-classification.ts`) の純粋関数で、
判別共用体 (`OwnPost` / `NotThreaded` / `ThreadRoot` / `IgnoredSubtype` / `ThreadedReply`) を返す。
元実装の `testdata/*.json` を `test/fixtures/` にコピーして等価性を検証している。

## ディレクトリ構成

hexagonal アーキテクチャで分離している。port (adaptor I/F) はすべて `src/domain/` に置く。

```
apps/slack-thread-expander/
├── src/
│   ├── index.ts                       # エントリ
│   ├── main.ts                        # GAS export: main / installTrigger / uninstallTrigger
│   ├── handler/                       # GAS のエントリポイントを wire する
│   │   ├── tick-handler.ts            # bootstrap → adaptors 構築 → runTick
│   │   └── trigger-handler.ts         # install/uninstall trigger
│   ├── usecase/                       # ビジネスロジック (port のみに依存)
│   │   ├── expand-channel.ts          # 1 channel の tick 処理
│   │   └── run-tick.ts                # lock + 全チャンネル繰り返し + 集計ログ
│   ├── domain/                        # 値オブジェクト・判別共用体・port I/F
│   │   ├── {channel-id,slack-ts,permalink,bot-id,user-id}.ts  # Branded Types
│   │   ├── slack-message.ts           # 正規化済みメッセージ
│   │   ├── message-classification.ts  # 判別共用体 + classify
│   │   ├── channel-tick-outcome.ts    # 1 channel あたりの outcome
│   │   ├── slack-api-error.ts         # Slack API 失敗の判別共用体
│   │   ├── config.ts / config-error.ts
│   │   └── {slack,cursor,clock,lock,logger}-port.ts  # adaptor I/F
│   ├── adaptor/                       # port の具象実装
│   │   ├── slack/                     # UrlFetchApp + zod
│   │   │   ├── slack-http-client.ts   # SlackPort を実装
│   │   │   ├── call-slack.ts          # HTTP/JSON/schema の共通処理
│   │   │   └── schemas/               # 内部 zod スキーマ
│   │   └── gas/                       # GAS API ラッパ
│   │       ├── gas-bootstrap.ts       # Script Properties → Config + 認証情報
│   │       ├── gas-properties-cursor-store.ts  # CursorPort 実装
│   │       ├── gas-lock-service.ts    # LockPort 実装
│   │       ├── gas-clock.ts           # ClockPort 実装
│   │       ├── gas-console-logger.ts  # LoggerPort 実装
│   │       └── gas-trigger.ts         # 時間トリガー登録/解除
│   └── util/assert-never.ts
├── test/                              # 純粋ロジックは mock port で検証可能
├── scripts/build.mjs                  # esbuild で dist/Code.js にバンドル
├── appsscript.json                    # GAS マニフェスト
├── app_manifest.yml                   # Slack App マニフェスト
└── .clasp.json.example
```

## デプロイ手順

通常運用は **main ブランチへの push をトリガーに GitHub Actions が `clasp push` を実行する** 構成。
初回のみ手動で clasp 認証と Apps Script プロジェクト作成が必要。

### 0. 初回セットアップ (CI deploy の前提)

```bash
cd apps/slack-thread-expander
pnpm install
pnpm exec clasp login --no-localhost   # 認証後 ~/.clasprc.json が生成される
pnpm exec clasp create \
  --type standalone \
  --title "slack-thread-expander" \
  --rootDir ./dist                     # .clasp.json が生成される
```

生成された `~/.clasprc.json` と `apps/slack-thread-expander/.clasp.json` の中身を、
リポジトリの GitHub Secrets に登録する:

| Secret 名                            | 内容                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `SLACK_THREAD_EXPANDER_CLASPRC_JSON` | `~/.clasprc.json` の全文                                          |
| `SLACK_THREAD_EXPANDER_CLASP_JSON`   | `apps/slack-thread-expander/.clasp.json` の全文 (scriptId を含む) |

`gh` CLI で登録する場合:

```bash
gh secret set SLACK_THREAD_EXPANDER_CLASPRC_JSON < ~/.clasprc.json
gh secret set SLACK_THREAD_EXPANDER_CLASP_JSON < apps/slack-thread-expander/.clasp.json
```

### 1. Slack App をセットアップ

1. <https://api.slack.com/apps> で **Create New App > From an app manifest** を選ぶ
2. ワークスペースを選択し、`app_manifest.yml` の内容を貼り付けて作成
3. **OAuth & Permissions** 画面で「Install to Workspace」を押す
   - `Bot User OAuth Token` (`xoxb-...`) を控える
   - `User OAuth Token` (`xoxp-...`) を控える（`search.messages` 用）
4. 対象チャンネルそれぞれに Bot を invite する: `/invite @thread-expander`
5. User Token の所有ユーザーも対象チャンネル全てに参加していること（参加していないチャンネルは検索結果に出ない）

### 2. デプロイ

**通常運用**: `main` ブランチに `apps/slack-thread-expander/**` の変更を含む push があると、
`.github/workflows/deploy-slack-thread-expander.yml` が tsc → test → build → `clasp push` を実行する。
手動キックは GitHub Actions の **Run workflow** から行う。

**手動デプロイ (ローカル)**:

```bash
pnpm deploy   # = pnpm build && pnpm clasp:push
```

### 3. Script Properties を設定

GAS Editor の **プロジェクト設定 > スクリプト プロパティ** から登録:

| キー               | 値                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`  | Bot User OAuth Token (`xoxb-...`) — `chat.postMessage` の投稿用                             |
| `SLACK_USER_TOKEN` | User OAuth Token (`xoxp-...`) — `search.messages` / `conversations.info` 用                 |
| `TARGET_CHANNELS`  | 監視対象のチャンネル ID をカンマ区切り (例: `C0123ABC,C0456DEF`)                            |
| `SELF_BOT_ID`      | (任意) Bot 自身が投稿した permalink を二重展開しないためのガード。`auth.test` で取得する ID |

### 4. トリガーを登録

GAS Editor で関数 `installTrigger` を 1 度だけ手動実行すると、
`main` を 1 分毎に呼ぶ時間トリガーがセットされる。
解除するときは `uninstallTrigger` を実行する。

### 動作確認

GAS Editor から `main` を手動実行し、実行ログでチャンネルごとの `fetched=N expanded=N` を確認する。
初回実行時は `last_ts` を「現在時刻」で初期化するだけで、過去のスレッドは遡及しない。

## 元実装との差分

| 観点           | 元実装 (Rust)                     | 本実装 (GAS)                               |
| -------------- | --------------------------------- | ------------------------------------------ |
| 通信方式       | Socket Mode (WebSocket)           | 時間トリガー + `search.messages`           |
| 遅延           | 即時                              | 最大 1 分 + 検索インデックス反映遅延       |
| 必要トークン   | App-Level Token + Bot OAuth Token | Bot OAuth Token + User OAuth Token         |
| 対象チャンネル | Bot が参加した全チャンネル        | `TARGET_CHANNELS` に明示 (User も参加必須) |
| 状態管理       | なし (イベント駆動)               | チャンネル別 `LAST_TS_<channel>`           |
| デプロイ       | バイナリ常駐                      | clasp push + 時間トリガー                  |

## 開発コマンド

```bash
pnpm tsc        # 型チェック
pnpm test       # vitest (findThreadedReply の等価性検証)
pnpm lint:fix   # eslint
pnpm format     # dprint
pnpm build      # esbuild で dist/Code.js を生成
pnpm clasp:push # ビルド済 dist を GAS へプッシュ
pnpm deploy     # build + clasp:push
```
