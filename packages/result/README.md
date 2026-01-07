# @iwasa-kosui/result

TypeScript向けのResult型ライブラリです。例外をスローせずにエラーを型安全に扱うことができます。

## インストール

```bash
pnpm add @iwasa-kosui/result
```

## 基本的な使い方

### Result型

`Result<T, E>` は成功値 `T` またはエラー値 `E` を表す型です。

```typescript
import { Result } from "@iwasa-kosui/result";

// 成功値を作成
const success = Result.ok(42);
// { ok: true, val: 42 }

// エラー値を作成
const failure = Result.err("Something went wrong");
// { ok: false, err: "Something went wrong" }
```

### 型ガード

```typescript
if (Result.isOk(result)) {
  console.log(result.val); // 型安全にアクセス可能
}

if (Result.isErr(result)) {
  console.log(result.err); // 型安全にアクセス可能
}
```

## 変換関数

### map

成功値を変換します。エラーの場合は何もしません。

```typescript
import { flow } from "@iwasa-kosui/result";

const result = flow(
  Result.ok(21),
  Result.map((x) => x * 2)
);
// Result.ok(42)
```

### mapErr

エラー値を変換します。成功の場合は何もしません。

```typescript
const result = flow(
  Result.err("error"),
  Result.mapErr((e) => e.toUpperCase())
);
// Result.err("ERROR")
```

### andThen

成功値に対して新しいResultを返す関数を適用します（フラットマップ）。

```typescript
const divide = (a: number, b: number): Result<number, string> =>
  b === 0 ? Result.err("Division by zero") : Result.ok(a / b);

const result = flow(
  Result.ok(10),
  Result.andThen((x) => divide(x, 2))
);
// Result.ok(5)
```

### orElse

エラー値に対して新しいResultを返す関数を適用します。

```typescript
const result = flow(
  Result.err("error"),
  Result.orElse((e) => Result.ok(0)) // エラーをリカバリ
);
// Result.ok(0)
```

### andThrough

副作用を実行し、成功すれば元の値を返します。失敗すればエラーを伝播します。

```typescript
const result = flow(
  Result.ok(42),
  Result.andThrough((x) => {
    console.log(x); // 副作用
    return Result.ok(undefined);
  })
);
// Result.ok(42)
```

## 複数のResultを扱う

### combine

オブジェクト内の複数のResultを1つにまとめます。

```typescript
const result = Result.combine({
  a: Result.ok(1),
  b: Result.ok(2),
  c: Result.ok(3),
});
// Result.ok({ a: 1, b: 2, c: 3 })

const errorResult = Result.combine({
  a: Result.ok(1),
  b: Result.err("error in b"),
  c: Result.err("error in c"),
});
// Result.err(["error in b", "error in c"])
```

### all

配列内の複数のResultを1つにまとめます。

```typescript
const result = Result.all([
  Result.ok(1),
  Result.ok(2),
  Result.ok(3),
]);
// Result.ok([1, 2, 3])
```

### bind

オブジェクトに新しいプロパティを追加しながらチェーンします。

```typescript
const result = flow(
  Result.ok({ a: 1 }),
  Result.bind("b", (obj) => Result.ok(obj.a + 1)),
  Result.bind("c", (obj) => Result.ok(obj.b + 1))
);
// Result.ok({ a: 1, b: 2, c: 3 })
```

## アンラップ

### unwrapOr

成功値を取り出します。エラーの場合はデフォルト値を返します。

```typescript
const value = flow(
  Result.err("error"),
  Result.unwrapOr(0)
);
// 0
```

### unsafeUnwrap / unsafeUnwrapErr

強制的に値を取り出します。失敗すると例外をスローします。

```typescript
const value = Result.unsafeUnwrap(Result.ok(42));
// 42

const error = Result.unsafeUnwrapErr(Result.err("error"));
// "error"
```

### match

成功とエラーのケースを明示的にハンドリングします。

```typescript
const message = flow(
  Result.ok(42),
  Result.match({
    ok: (val) => `Success: ${val}`,
    err: (err) => `Error: ${err}`,
  })
);
// "Success: 42"
```

## ResultAsync

非同期処理のためのユーティリティも提供しています。

```typescript
import { ResultAsync } from "@iwasa-kosui/result";

const result = await flow(
  ResultAsync.ok(fetchData()),
  ResultAsync.map(async (data) => process(data)),
  ResultAsync.andThen(async (processed) => validate(processed))
);
```

`ResultAsync` は `Result` と同様のAPI（`map`, `mapErr`, `andThen`, `orElse`, `match`, `bind`, `andBind`, `all`, `andThrough`）を提供しますが、非同期関数とPromiseを扱えます。

## pipeとflow

`@iwasa-kosui/pipe` の `pipe` と `flow` を再エクスポートしています。

```typescript
import { pipe, flow } from "@iwasa-kosui/result";

// flow: 値を最初の引数として渡し、関数を順番に適用
const result = flow(
  Result.ok(1),
  Result.map((x) => x + 1),
  Result.map((x) => x * 2)
);

// pipe: 関数を合成して新しい関数を作成
const transform = pipe(
  Result.map((x: number) => x + 1),
  Result.map((x) => x * 2)
);
const result = transform(Result.ok(1));
```

## ライセンス

Private
