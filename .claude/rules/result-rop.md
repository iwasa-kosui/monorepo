---
paths:
  - "apps/iori/**"
  - "packages/**"
  - "apps/akashic-ts/**"
---

# Railway Oriented Programming & レイヤードアーキテクチャ

## ROP with @iwasa-kosui/result

- 関数は`Result<T, E>`型を返し、成功/失敗を明示的に表現
- エラーは例外ではなく、型システムで追跡可能な値として扱う
- `pipe`, `map`, `andThen`, `orElse`でエラーハンドリングを構築

```typescript
import { Result, ok, err, pipe } from '@iwasa-kosui/result';
import * as ResultAsync from '@iwasa-kosui/result/resultAsync';

const run = (props: Omit<Post, 'postId'>): ResultAsync.ResultAsync<Post, PostAlreadyExists> =>
    pipe(
        ResultAsync.ok(props),
        ResultAsync.andThen(resolveByTitle),
        ResultAsync.andThen(errIfPostExists),
        ResultAsync.map((): PostCreated => Post.create(props)),
        ResultAsync.andThrough((event: PostCreated) => postCreatedStore.store(event)),
        ResultAsync.map((event: PostCreated): Post => Post.fromEvent(event))
    );
```

## レイヤードアーキテクチャにおける使い分け

- **ドメイン層**: `Result<T, E>`のみ（ビジネスルール検証、モデル生成・変更、イベント生成）
- **ユースケース層**: `ResultAsync<T, E>`を許容（リポジトリ通信、オーケストレーション、トランザクション管理）
