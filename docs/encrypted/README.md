# docs/encrypted

age で暗号化した機密ドキュメントを管理するディレクトリ。秘密鍵は Bitwarden で管理する。

## 復号手順

```bash
# 1. Bitwarden をアンロック
export BW_SESSION=$(bw unlock --raw)

# 2. プロセス置換で秘密鍵をディスクに残さず復号
age -d -i <(bw get notes "age-secret-key") docs/encrypted/career-questionnaire.md.age
```

## 暗号化手順

```bash
age -r age1d87pv8kxjxutn5dplm0yy98az6utw5kv4329qwcvh3566dlhvgrqyfzn8g -o docs/encrypted/<name>.age <平文ファイル>
```
