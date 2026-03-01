# 他言語経験者が知っておきたいTypeScriptのクラスの注意点

**著者:** 岩佐 幸翠 (@kosui_me)
**日付:** 2025-08-19
**最終更新:** 2026-02-02

## はじめに

TypeScriptのクラス構文はJavaやC#に似ていますが、JavaScriptの特性により重要な違いが存在します。本記事はクラスベース言語の経験者向けに、TypeScriptでクラスを使う際の注意点を解説します。

## 参考資料

- TypeScript: Documentation - TypeScript for Java/C# Programmers
- TypeScript: Documentation - Type Compatibility

## なぜ振る舞いに違いが生まれるのか

JavaScriptのクラスはプロトタイプベースのオブジェクト指向言語に導入されたシンタックスシュガーに過ぎず、Javaのような言語のクラスを完全に模倣したものではありません。

## 押さえておきたい4つのポイント

### 1. 型システムの特性：構造的部分型

TypeScriptは**構造的部分型**を採用します。オブジェクトの構造が一致していれば、異なるクラスでも型互換性があります。

#### 具体例

```typescript
import { randomUUID } from "node:crypto";

class User {
  id: string;
  name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}

class Product {
  id: string;
  name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}

const sortByUserId = (users: ReadonlyArray<User>): ReadonlyArray<User> =>
  [...users].sort((a, b) => a.id.localeCompare(b.id));

const user = new User(randomUUID(), "田中");
const product = new Product(randomUUID(), "商品A");

console.log(sortByUserId([user, product])); // エラーなし
```

`sortByUserId`は`{id: string, name: string}`構造を期待し、`User`と`Product`両者がそれを満たすため、型エラーは発生しません。

#### 実践パターン：Branded Typesで互換性をなくす

```typescript
type Brand<K, T extends symbol> = K & { [k in T]: true };

const UserIdSymbol = Symbol();
type UserId = Brand<string, typeof UserIdSymbol>;
type User = Readonly<{
  id: UserId;
  name: string;
}>;

const ProductIdSymbol = Symbol();
type ProductId = Brand<string, typeof ProductIdSymbol>;
type Product = Readonly<{
  id: ProductId;
  name: string;
}>;

const sortByUserId = (users: ReadonlyArray<User>): ReadonlyArray<User> =>
  [...users].sort((a, b) => a.id.localeCompare(b.id));

const user = {
  id: randomUUID() as UserId,
  name: "田中"
} as const satisfies User;

const product = {
  id: randomUUID() as ProductId,
  name: "商品A"
} as const satisfies Product;

sortByUserId([user]); // OK
sortByUserId([product]); // 型検査時にエラー
```

#### さらなる実践パターン：Zodによるスキーマ定義

```typescript
import { randomUUID } from "node:crypto";
import { z } from "zod";

const userIdSym = Symbol();
const UserId = z.uuid().brand(userIdSym);
type UserId = z.infer<typeof UserId>;

const User = z.object({
  id: UserId,
  name: z.string(),
}).readonly();
type User = z.infer<typeof User>;

const productIdSym = Symbol();
const ProductId = z.uuid().brand(productIdSym);
type ProductId = z.infer<typeof ProductId>;

const Product = z.object({
  id: ProductId,
  name: z.string(),
}).readonly();
type Product = z.infer<typeof Product>;

const sortByUserId = (users: ReadonlyArray<User>): ReadonlyArray<User> =>
  [...users].sort((a, b) => a.id.localeCompare(b.id));

const user = User.parse({
  id: randomUUID(),
  name: "田中",
});

const product = Product.parse({
  id: randomUUID(),
  name: "商品A"
});

sortByUserId([user]); // OK
sortByUserId([product]); // 型検査時にエラー
```

ZodTypeFactory パターン：

```typescript
import assert from 'node:assert'
import {Result} from 'option-t/plain_result/namespace'
import z from 'zod'

export type ZodTypeFactory<T extends z.ZodType> = Readonly<{
  zodType: T
  new: (value: z.input<T>) => Result.Result<z.infer<T>, z.ZodError<z.input<T>>>
  unsafeNew: (value: z.input<T>) => z.infer<T>
}>

export const ZodTypeFactory = {
  new: <T extends z.ZodType>(zodType: T): ZodTypeFactory<T> => {
    const safeNew = (value: z.input<T>): Result.Result<z.infer<T>, z.ZodError<z.input<T>>> => {
      const res = zodType.safeParse(value)
      if (!res.success) {
        return Result.createErr(res.error)
      }
      return Result.createOk(res.data)
    }

    return {
      zodType,
      new: safeNew,
      unsafeNew: (value: z.input<T>): z.infer<T> => zodType.parse(value),
    } as const
  },
} as const
```

### 2. `this`の振る舞いとコンテキスト

JavaScript/TypeScriptの`this`は関数の呼び出され方によって動的に決まります。

#### 問題例

```typescript
class Uploader {
  private storage = "/tmp";

  upload(fileName: string) {
    console.log(`Uploading ${fileName} to ${this.storage}...`);
  };
}

const uploader = new Uploader();
const api = { execute: (callback: (fileName: string) => void) => callback("document.pdf") };

api.execute(uploader.upload);
// TypeError: Cannot read properties of undefined (reading 'storage')
```

#### 実践パターン：アロー関数で`this`を束縛する

```typescript
class Uploader {
  private storage = "/tmp";

  public upload = (fileName: string) => {
    console.log(`Uploading ${fileName} to ${this.storage}...`);
  };
}

const uploader = new Uploader();
const api = { execute: (callback: (fileName: string) => void) => callback("document.pdf") };

api.execute(uploader.upload); // OK: Uploading document.pdf to /tmp...
```

#### 注意パターン：呼び出し側でケアする

```typescript
class Uploader {
  private storage = "/tmp";

  upload(fileName: string) {
    console.log(`Uploading ${fileName} to ${this.storage}...`);
  };
}

const uploader = new Uploader();
const api = { execute: (callback: (fileName: string) => void) => callback("document.pdf") };

api.execute(uploader.upload.bind(uploader)); // OK
api.execute(() => uploader.upload("document.pdf")); // OK
```

#### さらなる実践パターン：データと振る舞いを分離

```typescript
type Uploader = Readonly<{
  storage: string;
}>;

const Uploader = {
  new: (storage: string): Uploader => ({ storage }),
  upload: (uploader: Uploader) => (fileName: string): void => {
    console.log(`Uploading ${fileName} to ${uploader.storage}...`);
  },
} as const;

const uploader = Uploader.new("/storage");
const api = { execute: (callback: (fileName: string) => void) => callback("document.pdf") };
api.execute(Uploader.upload(uploader)); // OK
```

コンパニオンオブジェクトパターンを使用：

```typescript
import { Uploader } from './uploader';

type Dependencies = Readonly<{
  uploader: Uploader
}>;

type Input = Readonly<{
  fileName: string;
}>;

type UseCase = Readonly<{
  run: (input: Input) => void;
}>;

const UseCase = {
  from: ({ uploader }: Dependencies) => ({
    run: ({ fileName }: Input): void => {
      Uploader.upload(uploader)(fileName);
    }
  })
} as const;
```

### 3. アクセス修飾子（`private`）の有効範囲

TypeScriptの`private`修飾子は**静的な型検査においてのみ有効**です。トランスパイル後のJavaScriptには実行時の制限は含まれません。

#### 具体例

```typescript
class Account {
  private balance: number = 10000;
}

const myAccount = new Account();

// コンパイラはエラーを出す
// console.log(myAccount.balance); // Error

// 型チェッカーをバイパスすると実行時にアクセス可能
const untypedAccount: any = myAccount;
console.log(untypedAccount.balance); // 10000
```

#### 実践パターン：ECMAScriptのプライベートフィールド（`#`）を使用

```typescript
class Account {
  #balance: number = 10000;

  public getBalance() {
    return this.#balance;
  }
}

const myAccount = new Account();
console.log(myAccount.getBalance()); // 10000
// console.log(myAccount.#balance); // SyntaxError
```

### 4. 実行時の型情報と型ガード

TypeScriptの型情報はトランスパイル時に消去されるため（Type Erasure）、実行時に`instanceof`でチェックできません。

#### 具体例

```typescript
interface Drawable {
  draw(): void;
}

class Circle implements Drawable {
  draw() {
    /* ... */
  }
}

function render(item: Drawable) {
  if (item instanceof Drawable) {
    // Error: 'Drawable' only refers to a type
  }
}
```

#### 実践パターン：判別可能なユニオン型

```typescript
type Circle = Readonly<{
  kind: "circle";
  radius: number;
}>;

type Square = Readonly<{
  kind: "square";
  sideLength: number;
}>;

type Triangle = Readonly<{
  kind: "triangle";
  base: number;
  height: number;
}>;

type Shape = Circle | Square | Triangle;

const getArea = (shape: Shape): number => {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;

    case "square":
      return shape.sideLength ** 2;

    case "triangle":
      return (shape.base * shape.height) / 2;

    default:
      const _exhaustiveCheck: never = shape;
      return _exhaustiveCheck;
  }
}
```

assertNever関数：

```typescript
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${value}`);
};

const getArea = (shape: Shape): number => {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;

    case "square":
      return shape.sideLength ** 2;

    case "triangle":
      return (shape.base * shape.height) / 2;

    default:
      return assertNever(shape);
  }
}
```

#### 注意パターン：ユーザー定義型ガード関数

```typescript
function isCircle(shape: Shape): shape is Circle {
  return shape.kind === "circle";
}

function getRadiusIfCircle(shape: Shape): number | undefined {
  if (isCircle(shape)) {
    return shape.radius;
  }
  return undefined;
}
```

**注意：** ユーザー定義型ガード関数は強力ですが危険です。型述語は実装が正しいかどうか検証されません。switch文による判別可能なユニオン型の使用を優先してください。

## 関数型のアプローチによるドメインモデリング

クラスを使用しない関数型スタイルは、TypeScriptの型システムの強力さを引き出します。

### なぜ関数型ドメインモデリングを採用するのか

- **データ（型）と振る舞い（関数）の分離**
- **不変性（Immutable）の実現**
- **純粋な関数による状態遷移**
- **`this`の複雑さから解放**

### 具体例：記事ドメインの関数型モデリング

#### データ（状態）を「型」で表現する

```typescript
import { z } from 'zod';

const userIdSym = Symbol();
export const UserId = z.uuid().brand(typeof userIdSym);
export type UserId = z.infer<typeof UserId>;

export const articleIdSym = Symbol();
export const ArticleId = z.uuid().brand(typeof articleIdSym);
export type ArticleId = z.infer<typeof ArticleId>;

const titleSym = Symbol();
export const Title = z.string().max(100).brand(typeof titleSym);
export type Title = z.infer<typeof Title>;

type ArticleBase = Readonly<{
  id: ArticleId;
  title: Title;
  content: string;
}>;

export type DraftArticle = ArticleBase &
  Readonly<{
    status: "DRAFT";
  }>;

export type InReviewArticle = ArticleBase &
  Readonly<{
    status: "IN_REVIEW";
    reviewerId: UserId;
  }>;

export type PublishedArticle = ArticleBase &
  Readonly<{
    status: "PUBLISHED";
    reviewerId: UserId;
    publishedAt: Date;
  }>;

export type Article = DraftArticle | InReviewArticle | PublishedArticle;
```

#### 振る舞いを「純粋な関数」で表現する

```typescript
const publish = (
  article: InReviewArticle,
  publishDate: Date
): PublishedArticle => ({
  ...article,
  status: "PUBLISHED",
  publishedAt: publishDate,
})

export const Article = {
  publish,
} as const;

const articleInReview: InReviewArticle = {
  /* ... */
};
const publishedArticle: PublishedArticle = Article.publish(articleInReview, new Date());
```

#### テスト例

```typescript
import { describe, test, expect } from 'vitest';

describe("レビュー中の記事を公開する", () => {
  test("公開日時を指定して公開できる", () => {
    const publishDate = new Date();

    const articleInReview = {
      id: ArticleId.parse("0a285ad7-6560-4b52-a94c-16e10824e589"),
      title: Title.parse("記事タイトル"),
      content: "記事の内容",
      status: "IN_REVIEW",
      reviewerId: UserId.parse("75527afc-ea1a-46b3-84db-f6ba3559ff07"),
    } as const satisfies InReviewArticle;

    const publishedArticle = Article.publish(articleInReview, publishDate);

    expect(publishedArticle.status).toBe("PUBLISHED");
    expect(publishedArticle.publishedAt).toBe(publishDate);
    expect(publishedArticle.reviewerId).toBe(articleInReview.reviewerId);
  });
});
```

## まとめ

### 言語の特性を理解し、最適な設計アプローチを選択する

TypeScriptは単一のプログラミングパラダイムを強制しません。本記事で解説した注意点を理解し、適切なパターンを適用することで、型システムの力を最大限に引き出せます。

関数型ドメインモデリングは、特に複雑な状態遷移のドメインで見通しが良く、堅牢な設計をもたらします。最も重要なのは、JavaScriptおよびTypeScriptの根本的な特性を理解した上で、意識的な技術選定をすることです。

---

**ブログ情報:**
- ブログ: KAKEHASHI Tech Blog
- 著者: kakehashi_dev チーム
- カテゴリ: 技術, TypeScript
