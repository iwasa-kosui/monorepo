---
theme: ../../themes/kosui-me
title: "本当にclassを使わずにシステムを運用できるの？"
info: |
  TSKaigi 2026
author: 岩佐 幸翠
keywords: TypeScript, ECMAScript, class, 構造的部分型, 型消去
transition: slide-left
duration: 30min
mdc: true

talk:
  date: "2026-06-24"
  event: "TSKaigi 2026 事後勉強会"
  description: 実際の運用中のシステムを紹介
  themes:
    - typescript
  duration: "30min"
  speaker: "岩佐 幸翠"
---

<div class="text-sm opacity-80 mb-16">TSKaigi 2026 事後勉強会</div>

# 本当にclassを使わずにシステムを運用できるの？

<div class="mt-16">
  <div class="text-lg">2026年6月24日</div>
  <div class="text-lg">kosui (岩佐 幸翠)</div>
</div>

---
layout: center
class: text-center
---

# class、使ってますか

---

# クイズ

## classを使っているあなたなら正解できる！

<div class="grid grid-cols-4 gap-3 mt-4 items-start">

<div class="col-span-2">

```typescript
class Rectangle {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

const r1 = new Rectangle(1, 2);
const r2 = { width: 3, height: 4 };

const isRectangle =
  (r: Rectangle): boolean =>
    r instanceof Rectangle;

isRectangle(r1);
isRectangle(r2);
```


</div>

<div class="col-span-2">

Q. `r1` はRectangle classのインスタンスだが  
`r2` はあくまでコンストラクタを経由しない

`r2` を `isRectangle` の引数に与えると...

- A) 型検査を通らない
- B) 型検査は通り、実行時エラー
- C) 型検査は通り、 `true` を返す
- D) 型検査は通り、 `false` を返す


</div>

</div>

---

# クイズ

## 正解発表

<div class="grid grid-cols-4 gap-3 mt-4 items-start">

<div class="col-span-2">

```typescript
class Rectangle {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

const r1 = new Rectangle(1, 2);
const r2 = { width: 3, height: 4 };

const isRectangle =
  (r: Rectangle): boolean =>
    r instanceof Rectangle;

isRectangle(r1);
isRectangle(r2);
```


</div>

<div class="col-span-2">

Q. `r1` はRectangle classのインスタンスだが  
`r2` はあくまでコンストラクタを経由しない

`r2` を `isRectangle` の引数に与えると...

- <span class="text-gray">A) 型検査を通らない</span>
- <span class="text-gray">B) 型検査は通り、実行時エラー</span>
- <span class="text-gray">C) 型検査は通り、 `true` を返す</span>
- <span class="text-red">D) 型検査は通り、 `false` を返す 💯</span>

</div>

</div>

---

# TSKaigi 2026のおさらい

### TypeScriptのclassでつまづくポイント

- 構造的部分型だから classのインスタンス以外も型検査時は通る
- 型消去によって型検査時の情報は実行時にアクセスできない
- `this` の指す先がインスタンスとは限らない

詳しくは本編をみてね！

---

# 私の主張

TypeScriptのclassを使わない世界もあるよ

構造的部分型という型システムを逆手に取り、全てをプレーンなオブジェクトとして表現することで  
型検査時と実行時のメンタルモデルの違いを減らせる

- Branded Type
- Discriminated Union
- Companion Object Pattern

### しかし...

大規模なプロジェクトで本当にclassを使わずに運用できるのか？

そしてその設計は手間に見合った価値をもたらすのか？

---

# 実例

## カケハシで運用されている認証基盤 (IdP)

- 医療システムで求められる高い可用性とセキュリティ
- 厚労省のガイドラインに準拠
- 5つ以上のプロダクトが接続するOpenID Connect Provider
- TypeScriptで構築されている
- アプリケーションコード上は**classを利用していない**

---

# 全てを値で表現する

- UserId, ClientId  
  Branded Typeで表現する
- ログインセッションやトークンの検証状態  
  Discriminated Unionで表現する
- UserやClientなどのエンティティ  
  kind付きの単なるオブジェクトとして表現する

単なるオブジェクトでありclassのインスタンスではないので、  
テストのフィクスチャ、DBのデータモデル、HTTP リクエスト/レスポンスの  
いずれでも同じデータ構造でエンティティを扱える

---

# 全てを値で表現する: コード例

```typescript
// 認証フローの状態を Discriminated Union で表現
type Started          = { step: 'Started' }
type AccountSelected  = { step: 'AccountSelected'; userId: UserId }
type LoggedIn         = { step: 'LoggedIn'; userId: UserId; method: 'Password' | 'Passkey' }
type Consented        = { step: 'Consented'; userId: UserId; method: 'Password' | 'Passkey'; consentedAt: Date }

type AuthFlow = Started | AccountSelected | LoggedIn | Consented

// 状態遷移は単なる関数
const login = (flow: AccountSelected, method: 'Password' | 'Passkey'): LoggedIn => ({
  ...flow, step: 'LoggedIn', method,
})
```

---

# Branded Type の限界

Branded Type はあくまで型の名前空間上で識別子をつけているだけで、実行時に検証する手段はない

```typescript
type UserId = string & { readonly [UserIdBrand]: never }

// 実行時には単なる string — 由来を判定する手段がない
console.log(typeof userId) // "string"
```

たとえば `UserId` を Branded Type で表現しても、  
その値がユーザー入力由来なのかDB由来なのかを実行時に判定できない

---

# Discriminated Union で解決する

ステータスやタグを実行時にも参照したいなら `kind` を持たせるのが素直  
最近の Error オブジェクトが内部的なシンボルで識別情報を持つのと同じ発想

```typescript
type LoginSession =
  | { kind: 'Unverified'; userId: UserId; expiresAt: Date }
  | { kind: 'Verified'; userId: UserId; expiresAt: Date; verifiedAt: Date }

if (session.kind === 'Verified') {
  // verifiedAt に安全にアクセスできる
}
```

---

# 全ての値を検証する

<div class="grid grid-cols-2 gap-4 mt-2 items-center">

<div>

### 外側

全ての境界でスキーマライブラリが必ず検証する

### 内側

スキーマライブラリが実行時と型検査時の双方で  
検証するため、スキーマライブラリの型をそのまま使える

あらゆるエンティティは単なる値として表現され  
その振る舞いはメソッドではなく単なる関数で表現する

</div>

<div>
  <img src="/boundary-architecture.svg" class="w-full" />
</div>

</div>

---

# でもそんな仕組みをゼロから構築できない、というあなたへ

**kamae-ts** というAIエージェントのためのプラグインを用意しました

Claude Code や Codex などのAIエージェントにこの設計パターンを教え込み、  
コーディングを支援させることができます

```bash
npx skills add iwasa-kosui/kamae-ts
```

---
