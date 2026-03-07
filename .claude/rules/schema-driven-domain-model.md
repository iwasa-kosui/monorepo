---
paths:
  - "apps/iori/**"
  - "packages/**"
  - "apps/akashic-ts/**"
---

# Schema-Driven Development & Always-Valid Domain Model

## Schema-Driven Development with Zod

- スキーマはドメインモデルの単一真実源(Single Source of Truth)
- Zodの`brand()`でBranded Typeを作成し、プリミティブ型の誤用を防ぐ
- `z.infer<typeof schema>`で型を導出
- コンパニオンオブジェクトパターンで型の生成・操作メソッドを提供

```typescript
const PostIdSym = Symbol('PostId');
const PostIdSchema = z.string().uuid().brand(PostIdSym).describe('PostId');
export type PostId = z.infer<typeof PostIdSchema>;
export const PostId = {
    schema: PostIdSchema,
    generate: (): PostId => randomUUID() as PostId,
    parse: (data: unknown): Result<PostId, ValidationError> => {
        const result = PostIdSchema.safeParse(data);
        return result.success ? ok(result.data) : err(new ValidationError(result.error));
    },
} as const;
```

## Always-Valid Domain Model

- オブジェクト生成時にバリデーションし、不正なオブジェクトは作成させない
- Branded Type + コンパニオンオブジェクトパターンでファクトリメソッドを提供
- 状態変更メソッドも内部でバリデーションし、常に整合性を保つ
