---
paths:
  - "apps/iori/**"
  - "packages/**"
  - "apps/akashic-ts/**"
---

# Event-Driven Design

- ドメインイベントで集約の状態変化を記録（不変、過去の事実）
- `DomainEvent<TAggregateKind, TAggregateId, TAggregate, TEventName, TEventPayload>` 型を使用
- イベントソーシング・CQRSへの拡張が容易
