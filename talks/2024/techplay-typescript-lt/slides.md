---
theme: ../../themes/typescript
title: "品質とスピードを両立: TypeScript の柔軟な型システムをバックエンドで活用する"
class: text-center
highlighter: shiki
drawings:
  persist: true
mdc: true

talk:
  date: "2024-03-26"
  event: "Findy様 TypeScript 開発言語を統一 〜フロントからバックまで活用〜 Lunch LT" 
  description: |
    TypeScriptの柔軟な型システムをバックエンドで活用し、品質とスピードを両立させるための実践的なテクニックを紹介します。
  tags:
    - TypeScript
    - Backend
  duration: "10min"
  speaker: "岩佐 幸翠"
---

# 品質とスピードを両立: <br />TypeScript の柔軟な型システムを<br />バックエンドで活用する

**kosui (@kosui_me)**

---

<div class="flex gap-[10vw]">
<div class="w-[30%]">
<img src='/icon.png' class='w-full'><br/>
<tabler-home /> https://kosui.me<br/>
<tabler-brand-bluesky /> @kosui.me<br/>
<tabler-brand-x /> @kosui_me<br/>

</div>
<div class="flex-1">

# kosui / 岩佐 幸翠

## <tabler-building /> 株式会社カケハシ

日本の医療体験をしなやかにするために
医薬業界向けのサービスを多面的に展開

## <tabler-users /> 社内プラットフォームシステムの開発

医療システムに要求される高い品質と
医療体験を本気で変えるためのスピードを両立させたい

プロダクト開発チームと一緒に
テックリードとして認証基盤・組織管理システムなどを開発

</div>
</div>

---

# バックエンドとフロントエンドの共通点

## 言語を統一すれば、共通の知見や資産を活用できる

### エコシステムへの知見や設定

リンター、フォーマッター、パッケージマネージャーなど

### 標準ライブラリへの知見

`Array`、`Promise`、`JSON` など

### 型の表現

`keyof` などの型演算子や、`Partial<T>` などのユーティリティ型などの活用方法

---

# バックエンドとフロントエンドの相違点

## 言語を統一すれば、設計や実装の技法も統一できる?
## そうとは限らない

### 例: バリデーションの場合

<div class="grid grid-cols-2 gap-16">
<div>

**フロントエンド**: **使用性**を重視

エラーを明快にフィードバックするべき
選択肢に無い値を選んだ場合のエラー文言は不要

<img src="/alert.svg" class="w-[75%] mt-0">

</div>
<div>

**バックエンド**: **信頼性**と**機能性**を重視

悪意あるユーザーや想定外の動作環境などを考慮し
より厳密に検証するべき

```typescript
const FRUITS = ["りんご", "みかん", "ぶどう"] as const;

if (FRUITS.includes(selected /* 納豆 */)) {
  throw new Error("invalid");
}
```

</div>
</div>

---

# この発表のねらい

## 問題

バックエンドのような信頼性・機能性が重要なシステムを TypeScript で開発するためには？

## 解決策

### 方針

- TypeScript の型システムとバックエンドの相性の良い部分・悪い部分を理解する
- TypeScript の型システムの柔軟性を活かしたデザインパターンを使いこなす

##### おことわり

私の発表ではバックエンドにフォーカスしますが
「フロントエンドとの連携」などについては、この後の発表をご期待下さい！

---
layout: title-only
---

# バックエンドの品質特性

## なぜバックエンドでは信頼性・機能性が重要か

---

# 役割と品質特性から見たバックエンド

### バックエンドで重視される品質特性

- **機能性** 定義された I/F を満たし、正しくセキュアに処理できる
- **信頼性** 安定して動作し、障害やエラーから復旧できる

### バックエンドの役割

<div class="flex justify-between w-full">
<div class="flex w-[33%] items-center flex-col">
<tabler-math-symbols class="text-[120px]" />
<h3 class="m-0">正確性が重要な処理</h3>

会計・決済など正確性が重要な
処理は改ざん防止のため
バックエンドで行う

</div>
<div class="flex w-[33%] items-center flex-col">
<tabler-database class="text-[120px]" />
<h3 class="m-0">データの永続化</h3>

プロダクトの性質に応じて
一貫性や整合性などを考慮して
データを永続化する

</div>
<div class="flex w-[33%] items-center flex-col">
<tabler-cloud-lock class="text-[120px]" />
<h3 class="m-0">非公開データの参照</h3>

全てのユーザー・顧客の
個人情報や認証情報など
リスクのあるデータを扱う

</div>
</div>

---
layout: title-only
---

# TypeScript の型システムと<br />バックエンドの相性

---

# TypeScript が採用している構造的部分型

<div class="grid grid-cols-2 gap-16">

<div>

## 名前的部分型 (公称的部分型)

型の名前で互換性を判定する
以下は Java の例

```java
// Java
record Animal(
  String name
) {}

record Human(
  String name,
  int age
) {}

Animal animal = new Human("kosui", 29);
//              ^^^^^^^^^^^^^^^^^^^^^^
//              Incompatible types...
```

</div>

<div>

## 構造的部分型

オブジェクトの構造で互換性を判定する
記述量を抑えつつ型システムの恩恵を得られる

```typescript
// TypeScript
type Animal = {
  name: string;
};

const human = {
  name: "kosui",
  age: 29,
};

const animal: Animal = human;
// `human` がAnimalを継承しなくてもビルドが通る
```

</div>
</div>

---

# 構造的部分型の利点

記述量を抑えつつ型システムの恩恵を得られる

- 同じ構造を持つオブジェクトについて型の詰め替えを省略できる
  例) データベースから取得したデータからエンティティへの詰替え
- テスト用のダミーやモックを簡便に表現できる

<div class="w-[70%]">

```typescript
// animal.ts
type Animal = {
  name: string;
};

interface AnimalRepository {
  find(id: string): Promise<Animal>;
}
```

```typescript
// animal.test.ts
const dummyRepo = {
  find: (id: string) => Promise.resolve({ id, name: "foobar" }),
};
```

</div>

---

# 構造的部分型の特性とバックエンドの不具合

<div class="grid grid-cols-2 gap-16">

```typescript
type User = {
  userId: string;
};

type Role = {
  userId: string;
  role: string;
};

const UserRepository = {
  delete: (user: User) => Promise<void>,
};

const deleteRole = async (role: Role) => {
  // Roleと間違えてUserを削除している
  await UserRepository.delete(role);
};
```

<div>

構造的部分型では構造さえ同じなら何でも通す
しばしば思わぬ結果をもたらす

### データ更新時の不具合

例) リポジトリに誤ったオブジェクトを渡しても
ビルドと実行が成功してしまう

永続化処理は不具合があると復旧が難しい

### 機密データの露出

例) オブジェクトに機密データのプロパティが
含まれていることに気付けない

</div>
</div>

---
layout: title-only
---

# 型定義のデザインパターンと<br />バックエンドでの利用例

---

# タグ付きユニオン - エンティティの区別

<div class="grid grid-cols-2 gap-16">

```typescript
type User = {
  kind: "User";
  userId: string;
};

type Role = {
  kind: "Role";
  userId: string;
  role: string;
};

type Entity = User | Role;

const UserRepository = {
  delete: (user: User) => Promise.resolve(),
};

const deleteRole = async (role: Role) => {
  await UserRepository.delete(role);
  //                          ^^^^
  // Argument of type 'Role' is not ...
};
```

<div>

### タグ付きユニオン

リテラル型の値から型を絞り込むことができる

### 利用例: エンティティの区別

`kind` プロパティでエンティティを区別する

`User` と `Role` を
取り違えて削除してしまうのを防げる

</div>

</div>

---

# 幽霊型 - リテラル型の区別

実行時には存在しないプロパティを追加する**幽霊型**は
`string` 型や `number` 型などのリテラル型を区別するのに便利

<div class="w-[500px]">

```ts
type Newtype<T, Kind extends string> = T & {
  [key in `__${Kind}`]: never;
};
```

</div>

<div class="grid grid-cols-[500px_1fr] gap-16">
<div>

### 利用例: ID・コードの区別

異なるエンティティの ID の代入を防げる

```ts
type PostId = Newtype<string, "PostId">;
type UserId = Newtype<string, "UserId">;

const userId: UserId = "aaa" as UserId;
const postId: PostId = userId;
//    ^^^^^^
// Type 'UserId' is not assignable ...
```

</div>
<div>

### 利用例: バリデーション済みかを示す

検証済みの値と生の値を区別できる

```typescript
type Username = Newtype<string, "Username">;
const Username = {
  parse: (raw: string): Username | undefined =>
    raw.length > 0 && raw.length < 16 && regexp.test(raw)
      ? (raw as Username)
      : undefined,
} as const;

const username = Username.parse("abc");
```

</div>
</div>

---

# 実行時の検査

一方で実行時にプロパティの値を検査することで堅牢なシステムを構築するアプローチも存在します。 Zod を使うことで、定義したスキーマを満たす場合のみオブジェクトへ変換できます。品質とスピードを両立するためには それぞれの機能に要求される品質にマッチした方法を選びましょう。
