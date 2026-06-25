---
theme: ../../themes/kosui-me
title: "本当にTypeScriptのclassを使わずにシステムを運用できるの？"
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

# 本当にTypeScriptのclassを使わずにシステムを運用できるの？

<div class="mt-16">
  <div class="text-lg">2026年6月24日</div>
  <div class="text-lg">kosui (岩佐 幸翠)</div>
</div>

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

### え？

🦐 < 何で型検査通るんだよ

</div>



</div>

---

# TSKaigi 2026のおさらい

### TypeScriptのclassでつまづくポイント

- 構造的部分型だから コンストラクタから生まれたオブジェクト以外も型検査は通る
- 型消去によって型検査時の情報は実行時にアクセスできない
- `this` の指す先がインスタンスとは限らない

詳しくは本編をみてね！

---

# 私の主張

TypeScriptのclassを使わず、✨全てを値で表現する✨世界もあるよ

構造的部分型という型システムを逆手に取り、全てをプレーンなオブジェクトとして表現することで  
型検査時と実行時のメンタルモデルの違いを減らせる

```typescript
// エンティティは単なるオブジェクト
const user = { kind: 'User', id: 'u-1', name: 'kosui' } as const satisfies User

// 振る舞いは単なる関数
const rename = (user: User, name: string): Result<User, SameNameError> =>
  user.name === name ? err({ kind: 'SameNameError' }) : ok({ ...user, name })
```

### しかし...

大規模なプロジェクトで本当にclassを使わずに運用できるのか？

---

# 実例

## カケハシで運用されている認証基盤 (IdP)

- 医療システムで求められる高い可用性とセキュリティ
- 厚労省のガイドラインに準拠
- 5つ以上のプロダクトが接続するOpenID Connect Provider
- TypeScriptで構築されている
- アプリケーションコード上は**classを利用していない**

---

# なぜ全てを値で表現するのか

- アクセストークンとIDトークンを取り違えたら患者情報が漏洩する
- アカウント選択 → ログイン → 同意 → パスワード変更強制など  
  状態遷移を一つ間違えたらセキュリティホールになる
- この領域ではテスタビリティが生命線  
  全てを値で表現すれば、オブジェクトをただ用意するだけで入力と出力とエラーを表現・検証できる

---

# 全てを値で表現する

- UserIdのようなリテラル  
  Branded Typeで表現する
- ログインセッションやトークンの検証状態  
  Discriminated Unionで表現する
- UserやClientなどのエンティティ  
  kind付きの単なるオブジェクトとして表現する

単なるオブジェクトでありclassのインスタンスではないので、  
テストのフィクスチャ、DBのデータモデル、HTTP リクエスト/レスポンスの  
いずれでも同じデータ構造でエンティティを扱える

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

**Always-Valid Domain Model**  
境界で必ず検証することで、ドメイン内部の値は常に正しい状態が保証されるという考え方

</div>

<div>
  <img src="/boundary-architecture.png" class="w-full" />
</div>

</div>

---

# Branded Type の限界

Branded Type はあくまで型の名前空間上で識別子をつけているだけで、実行時に検証する手段はない

```typescript
type UserId = string & { readonly [UserIdBrand]: never }

// 実行時には単なる string — 由来を判定する手段がない
console.log(typeof userId) // "string"
```

たとえばアクセストークンとリフレッシュトークンを Branded Type で区別しても、  
実行時にどちらのトークンかを判定して処理を分岐することはできない

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

技術選定において何を得て何を失うのか、何ができて何ができないのか、  
きちんと見極めて使いこなすことが大事

---

# でもそんな仕組みをゼロから構築できない、というあなたへ

**kamae-ts** というAIエージェントのためのプラグインを用意しました

Claude Code や Codex などのAIエージェントにこの設計パターンを教え込み、  
コーディングを支援させることができます

```bash
npx skills add iwasa-kosui/kamae-ts
```

試してみてね!
