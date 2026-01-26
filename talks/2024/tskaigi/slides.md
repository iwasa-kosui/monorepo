---
theme: tskaigi
background: "#ffffff"
title: 複雑なビジネスルールに挑む：正確性と効率性を両立するfp-tsのチーム活用術
info: |
  ## fp-tsの柔軟な関数合成・エラー合成機能
  この発表では、複数の医療系SaaSを展開するカケハシにて、エンタープライズな顧客の組織階層を管理・配信する基盤システム「OGAS」の事例を紹介します。「Excel入稿ファイルからツリー形式のデータ構造を組み立てる」という複雑な要件に対し、fp-tsの柔軟な関数合成・エラー合成機能で立ち向かい、検証ロジックの正確さと効率性を両立させることができました。
  ## fp-tsをチームで活用するために
  さらに、この発表ではfp-tsをチームで活用するための工夫も紹介します。fp-tsは日本語の情報が少なく、neverthrowなどと比べて抽象度が高いため、しばしば敬遠されることがあります。しかし、OptionやEitherだけではなく、これらを柔軟に合成できるpipeやflow、Validationなどの仕組みを活用することで、複雑なビジネスロジックに立ち向かうことができます。私達は、一日二回のモブプロや、すぐに使える社内レシピ集などを通じ、幅広い背景を持つメンバーが活躍できる環境を実現しました。
class: text-center
highlighter: shiki
drawings:
  persist: true
mdc: true

talk:
  date: "2024-05-11"
  event: "TSKaigi 2024"
  description: |
    fp-tsの柔軟な関数合成・エラー合成機能を活用し、Excel入稿機能の複雑なバリデーションで正確性と効率性を両立させた事例を紹介します。
  tags:
    - TypeScript
    - fp-ts
    - Functional Programming
  duration: "20min"
  speaker: "岩佐 幸翠"
---

## 複雑なビジネスルールに挑む：

# _**正確性**_ と _**効率性**_ を両立する<br/><fp-ts />**fp-ts**のチーム活用術

### 株式会社カケハシ
### kosui (岩佐 幸翠)

---
layout: two-cols
layoutClass: "!grid-cols-[300px_1fr]"
---

<Avatar />

## <tabler-brand-x /> [@kosui_me](https://x.com/kosui_me)

## <tabler-brand-github /> [@iwasa-kosui](https://github.com/iwasa-kosui)

## <tabler-home /> https://kosui.me

::right::

# 自己紹介

## kosui (岩佐 幸翠)

### 株式会社カケハシ

薬局のDXを推進し
日本の医療体験を変革を目指すSaaS群を提供

### 組織管理・認証基盤リノベチーム

顧客に寄り添うプロダクト開発チームが
本質的な価値提供に集中できる世界を目指す

2023年9月よりテックリードとして
社内プラットフォームが創出できる
顧客への価値とは何か模索中

---

# この発表のねらい

## <fp-ts /> fp-ts で複雑性と闘う

複雑なビジネスロジックでも **_正確性_** と **_効率性_** を両立するために

- どのようにfp-tsを活用したか？
- チームで運用するためにどんな工夫をしたか？

<br />

### 題材

<vscode-icons-file-type-excel2 />一括入稿機能の開発で遭遇した悩みと解決策を紹介

<img src='/aim.svg' class='mt-2' />

---

# 目次

1. 背景
   SaaSのエンタープライズ対応と
   <vscode-icons-file-type-excel2 />Excel一括入稿機能の重要性
1. 課題<br />
   表形式データの検証にて<br/>
   正確かつ効率的にエラーを<br/>
   フィードバックするには？
1. fp-tsによるエラー合成
1. fp-tsのチーム活用

<style scoped>
li {
  font-size: 24px;
}
</style>

---
layout: cover
---

## 背景
# SaaSのエンタープライズ対応と<br />ファイル一括入稿機能の重要性

::icon::

<vscode-icons-file-type-excel2 />

---
layout: two-cols-header
layoutClass: "!grid-rows-[170px_1fr] !gap-4"
---

# バーティカル SaaS (Software as a Service) の発展と変化

医療や建築や物流などの領域でもDXが進んでいる

バーティカルSaaS業界が発展するにつれ
要求される機能や品質も変化している

::left::

## 個人・中小企業向け

- 差別化につながる先進的な機能と品質
- 安心して長期利用できるランニングコスト
- 眼の前の業務をすぐに楽にできる導入コスト

::right::

## 大企業・行政向け

- 上場企業の監査にも安心して対応できる
  セキュリティ性やコンプライアンス
- _組織管理_
  大規模で階層的な組織を
  効率的かつ柔軟に管理できる認可

---
layout: two-cols-header
layoutClass: "!grid-rows-[60px_1fr] grid-cols-[360px_1fr]"
---

# SaaSの組織管理

::left::

## 個人・中小企業向け

### データは _少量_ で構造も _シンプル_

<img src='/org-small-business.svg' style="height: 100px; margin-bottom: 30px;" />

### _<tabler-browser />GUI_ から登録したい

<img src='/form.svg' style="height: 155px" />

::right::

## 大企業・行政向け

### データが _大量_ で _階層的_

<img src='/org-enterprise.svg' style="height: 100px; margin-bottom: 0px;" />

### _<vscode-icons-file-type-excel2 />ファイル_ から一括入稿したい

<img src='/excel-example.svg' />

---
layout: two-cols-header
layoutClass: "!grid-cols-[360px_1fr]"
---

# _顧客_ から見た<vscode-icons-file-type-excel2 />ファイル一括入稿のつらさ

::left::

<img src=/bulk-import-flow.svg style='width: 320px' />

::right::

## 不明瞭なフィードバック

エラーの原因が判別しにくい
➡ 修正作業は多大な時間と労力を伴う

- 修正すべき箇所(セル)が不明瞭
- 修正すべき理由が不明瞭
  データ型？使用不能文字？値の重複？
  他のシートと依存関係がある場合は特に難しい

## 繰り返される再入稿

全てのエラーが一度に返却されない
➡ 何度も修正と再入稿を繰り返す

---
layout: cover
---

## 課題①
# <vscode-icons-file-type-excel2 />表形式データの検証にて<br/>_正確_ かつ _効率的_ にエラーを<br/>フィードバックするには？

::icon::

😭

---

# 表形式データの検証の3ステップ

<img src="/parse-flow.svg" />

---

### 表形式データ検証の課題
# 表形式データのエラー処理の実例

<img src="/parse-flow-error-1.svg" />

---

### 表形式データ検証の課題
# 表形式データのエラー処理の理想

<img src="/parse-flow-error-2.svg" />

---

### 表形式データ検証の課題
# 表形式データのエラー処理のあるある

<img src="/parse-flow-error-3.svg" />

---
layout: cover
---

## 解決策
# fp-tsによるエラー合成

::icon::

<fp-ts />

---

# TypeScriptのエラー処理

<div class="grid grid-cols-2 gap-4">

```ts
class ParseError extends Error {
  readonly row: number;
  constructor(row: number, msg: string) {
    super(msg);
    this.name = "ParseError";
    this.row = row;
  }
}
```

<div class='my-1'>

## ユーザー定義エラーを投げる

`Error` オブジェクトを拡張し
様々な情報を追加する

`instanceof` で型を絞り込める

</div>
</div>

<div class='grid grid-cols-2 gap-4 mt-4'>

```ts
type Either<E, A> = Left<E> | Right<A>;

type Left<T> =
  Readonly<{ _tag: 'Left'; left: T; }>;

type Right<A> =
  Readonly<{ _tag: 'Right'; right: A; }>;
```

<div class='my-1'>

## Either型 (Result型) で返す

<ruby>判別可能な直和型<rt>Discriminated Union</rt></ruby>で  `Left` ・ `Right` の
いずれかを取る値を表現

`Left`で失敗、`Right`で成功を表現し
例外を投げずに結果を返す

</div>
</div>

---

### TypeScriptのエラー処理

# 例外を投げる場合の悩み😭

## 複数のエラーを同時に伝搬しづらい

<div class='grid grid-cols-2 gap-4'>

```ts
const parseRow = (cells: string[]) => ({
  id: parseUserId(cells[0]),
  name: parseUsername(cells[1]),
  birthday: parseBirthday(cell[2]),
});
```

<div>

`parseUserId` が例外を投げてしまうと
他のセルの検証エラーをクライアントへ
返せないまま処理が中断

</div>
</div>

<div class='grid grid-cols-2 gap-4'>

```ts
const errors: Error[] = [];
let id: number;
try {
  id = parseUserId(cells[0]);
} catch(e) {
  errors.push(e);
}
```

<div class="-my-3">

try...catch文で拾って
配列に詰めていけば不可能ではない

しかし、流石にこれはつらい😭

</div>

</div>

<style scoped>
pre {
  height: 100%;
}
</style>

---

### TypeScriptのエラー処理
# Either型(Result型)

<div class='grid grid-cols-2 gap-4'>

```ts
type Either<E, A> = Left<E> | Right<A>;

type Left<T> =
  Readonly<{ _tag: 'Left'; left: T; }>;

type Right<A> =
  Readonly<{ _tag: 'Right'; right: A; }>;
```

<div>

判別可能なユニオン型を用いて
`Left` と `Right` のどちらかを取る値を表す

### エラー処理に使う場合
`Left` の場合をエラー
`Right` の場合を成功と表現できる

</div>
</div>

---

### TypeScriptのエラー処理
# Either型(Result型)で返す

```ts
const isRight = <E, A>(e: Either<E, A>) => e.tag === 'Right';
const isLeft = <E, A>(e: Either<E, A>) => e.tag === 'Left';

const right = <A>(val: A): Right<A> => ({ tag: 'Right', left: val });
const left = <E>(val: E): Left<E> => ({ tag: 'Left', left: val });

const parseUsername = (v: string): Either<ParseError, string> =>
  v.length > 0 && v.length < 16 ? right(v) : left(new ParserError());

const parseRow = (cells: string[]) => ({
  id: parseUserId(cells[0]),
  name: parseUsername(cells[1]),
});

console.log(parseRow([NaN, '😭']));
```

---

# それぞれのセルを行へ合成したい

<Arrow x1="490" y1="190" x2="520" y2="190" width=2 />

### エラーとなるセルが含まれる場合

<div class="grid grid-cols-2 items-center mb-4 gap-4 !grid-cols-[420px_300px] gap-x-[60px]">

```ts
{
  id: left([new ParseError(1, 'ID')]),
  name: left([new ParseError(1, '名前')]),
  storeId: right(22),
};
```

```ts
left([
  new ParseError(1, 'ID'),
  new ParseError(1, '名前'),
]);
```

</div>

<Arrow x1="490" y1="380" x2="520" y2="380" width=2 />

### エラーとなるセルが無い場合

<div class="grid grid-cols-2 items-center mb-4 gap-4 !grid-cols-[420px_300px] gap-x-[60px]">

```ts
{
  id: right(1),
  name: right('田中'),
  storeId: right(22),
};
```

```ts
right({
  id: 1,
  name: '田中',
  storeId: 22,
});
```

</div>

---

# それぞれのセルを行へ合成したい

<div class="grid grid-cols-[350px_1fr] mb-4 gap-4">

```ts
const errs: ParseError[] = [];
if (isLeft(id)) {
 errs.push(id.left);
}
if (isLeft(name)) {
  errs.push(name.left);
}

if (errs) {
  return left(errs);
}

assert(isRight(id));
assert(isRight(name));
return right({
  id: id.right,
  name: name.right;
});
```

<div>

## 自前実装

### いずれかのセルが `Left` の場合

エラーを取り出して配列に詰め
`Left<ParseError[]>` として返す

### 全てのセルが `Right` の場合

`Right<{ id: number, ... }>`
として返す

## ライブラリに頼りたい

😭 自分でやりたくはない

</div>
</div>

---

### それぞれのセルを行へ合成したい
# fp-tsによるオブジェクトのエラー合成

```ts
import * as AP from 'fp-ts/Apply';
import * as A from 'fp-ts/Array';
import * as E from 'fp-ts/Either';

// これを合成したい
const cells = {
  id: left([new ParseError(1, 'ID')]),
  name: left([new ParseError(1, '名前')]),
  storeId: right(22),
};

// 1. `Left` の `ParseError[]` を結合する関数 `ap` を定義
const ap = E.getApplicativeValidation(
  A.getSemigroup<string>(),
);

// 2. 先ほど定義した `ap` を用いて合成
const row = AP.sequenceS(ap)(cells);
```

<style scoped>
.slidev-layout {
  --slidev-code-font-size: 14px;
  --slidev-code-line-height: 21px;
}
</style>

---

# それぞれの行をシートへ合成したい

<Arrow x1="520" y1="190" x2="550" y2="190" width=2 />

### エラーとなる行が含まれる場合

<div class="grid grid-cols-2 items-center mb-4 gap-4 !grid-cols-[450px_400px] gap-x-[60px]">

```ts
const rows = [
  left([ new ParseError(1, 'ID') ]),
  left([ new ParseError(2, '名前') ]),
  right({ id: 3, name: '田中', storeId: 66 }),
];
```

```ts
const sheet = left([
  new ParseError(1, 'ID'),
  new ParseError(2, '名前'),
]);
```

</div>

<Arrow x1="520" y1="380" x2="550" y2="380" width=2 />

### エラーとなる行が無い場合

<div class="grid grid-cols-2 items-center mb-4 gap-4 !grid-cols-[450px_400px] gap-x-[60px]">

```ts
const rows = [
  right({ id: 1, name: '長野', storeId: 22 }),
  right({ id: 2, name: '大崎', storeId: 44 }),
  right({ id: 3, name: '田中', storeId: 66 }),
];
```

```ts
const sheet = right([
  { id: 1, name: '長野', storeId: 22 },
  { id: 2, name: '大崎', storeId: 44 },
  { id: 3, name: '田中', storeId: 66 },
]);
```

</div>

---

### fp-tsによるエラー合成
# 配列のエラー合成

```ts
const rows = [
  left([new ParseError(1)]),
  right({
    id: 2,
    name: '田中',
  }),
  left([new ParseError(3)]),
];

// 行へ合成
const sheet = A.sequence(ap)(rows);
```

---

### fp-tsによるエラー合成
# セル→行→シートまで一気通貫で合成

<Grid>

```ts
import { pipe } from 'fp-ts/function';
const raw = [
  [right(1), right('田中'), right(22)],
  [right(2), right('山田'), right(33)],
];

pipe(
  raw,
  // 1. 行へ合成
  A.map(AP.sequenceS(ap)),
  // 2. シートへ合成
  A.sequence(ap),
);
```

<div>

1. 各セルで構成されるオブジェクト ➡ 行へ
1. 行の配列 ➡ シートへ

合成処理を簡潔に表現できる😘

## 顧客への提供価値に直結

冒頭でも述べた通り表形式データの検証は
極力 _一度に_ 全てのエラーを返すことが
顧客体験のために重要



</div>
</Grid>

---
layout: cover
---

## 課題②
# <vscode-icons-file-type-excel2 />シート間の依存関係を<br/>型によって表現したい

---

### 表形式データ検証の課題
# 依存関係の解決

組織の階層構造を表現するために、ある行が他シートの行を参照する
例) ユーザーの所属を表現するため店舗シートを参照

<Grid width='500px'>

![](/dep.svg)

<div>

😱検証済みの行を参照したいのに
未検証の行を参照してしまった

➡ 型検査で未然に防ぎたい

</div>
</Grid>

---

# <fp-ts /> 公称型の活用

公称型を利用して検査の関門を一つに絞る

```ts
import * as E from 'fp-ts/Either';
import { Newtype, iso } from 'newtype-ts';

type ParseError = Readonly<{ message: string }>
const ParseError = { new: (message: string) => ({ message }) } as const

type Username = Newtype<{ readonly Username: unique symbol }, string>;
const Username = {
  // 「この関数を通らないとUsername型にできない」という状態へ
  parse: (v: string): E.Either<ParseError, Username> =>
    v.length > 0 && v.length < 16
      ? iso<Username>.wrap(v)
      : ParseError.new('文字列長が誤っています'),
} as const;
```

---
layout: cover
---

# fp-tsのチーム活用

::icon::

<fp-ts />

---

# fp-tsの難しさ

## fp-tsのコンセプト

関数型プログラミングのためのデータ型や型クラスなどの抽象化を提供する

> fp-ts provides developers with popular patterns and reliable abstractions
> from _typed functional languages_ in TypeScript.
>
> --- https://gcanti.github.io/fp-ts/

## fp-ts採用後に直面した課題

オンボーディングのコストが高い😱

- 関数型プログラミングへの一定の知識が必要
- 日本語の情報が少ない
- 業務での実用例の解説が少ない
  抽象度が高すぎて使い方が分からない

---

### チームでfp-tsを利用するために

# オンボーディングコストの削減

私自身 <s>学生時代にHaskellの講義の単位を落としかけたこともあり</s>
関数型プログラミングの知見が少なくチーム参画時にかなり苦労した

中長期的に持続して運用できるプロダクトにするためにオンボーディングコストを低減したい

## スコープを限定する

オンボーディングが必要なコンテキスト自体を削減し
その代わりにコンテンツの密度を高める

## 短期集中

高い密度で反復して学習できるように
メンバー参画時に集中してオンボーディングする

---

### チームでfp-tsを利用するために①
# スコープを限定する

fp-tsは前述の `Either` のみならず様々な抽象化を提供する
まず小さく始めるために、利用するものを限定するとよい

<div class="grid grid-cols-[1fr_1fr_1fr] mb-4 gap-4">
<div>

## 関数

- `pipe` `flow`
  合成関数

</div>
<div>

## データ型

- `Readonly(Array|Map)`
  readonlyの配列やマップ
- `NonEmptyArray`
  空ではない配列
- `Task` `TaskEither`
  非同期処理の抽象化

</div>
<div>

## 型クラス

- `Eq`
  等価性を表現
- `Ord`
  比較を表現
- `Bounded`
  上限と下限を表現

</div>
</div>

---

### チームでfp-tsを利用するために②
# 短期集中型 ペアプロ・モブプロ


<div class="grid grid-cols-[380px_1fr] mb-4 gap-8">
<img src=/scrum.svg class='shadow-lg rounded-lg shadow-blue-500/20 p-4' />
<div>


1日1回15-30分ほどペアプロ・モブプロをする

- タスクをあらかじめ決めておく
- まずは同期的な世界から入門し
  認知負荷を低減させる


</div>
</div>

---

## チームでfp-tsを利用するために③
# 社内向けレシピ集とプレイグラウンド

<div class="grid grid-cols-[380px_1fr] mb-4 gap-8">
<img src=/recipe.png class='shadow-lg rounded-lg shadow-blue-500/20' style="max-height: 200px !important; object-fit: cover; width: 100%; object-position: top;" />
<div>

### 実務での具体的な利用例を示す

- `O.fromPredicate` と `RA.filterMap` を用いて
  重複するコードを持つ部門だけを抽出する
- `Eq.struct` を用いてユーザーが
  同姓同名か判定する

</div>
</div>


<div class="grid grid-cols-[380px_1fr] mb-4 gap-8">
<img src=/playground.png />
<div>

WebContainersを利用した
プレイグラインドを構築

レシピ集のコードをそのまま
編集し実行できる

</div>
</div>

---

# まとめ

## ある程度成長したSaaSが直面する新たな要求

大企業・政府向けにはセキュリティやコンプラ対応が重要
それに加えて大規模な組織を管理できる機能が求められる

## 複雑な検証とエラー処理には `fp-ts` は便利

<vscode-icons-file-type-excel2 />Excel一括入稿機能にある表形式データの検証を例示

- エラー合成
- 検証前後の文脈の明示
- 同一性の担保

## `fp-ts` をチームで活用するために

利用する機能をあらかじめ限定した上で
具体例を含めた社内レシピを用意し、ペアプロ・モブプロで密度の高いオンボーディングを
