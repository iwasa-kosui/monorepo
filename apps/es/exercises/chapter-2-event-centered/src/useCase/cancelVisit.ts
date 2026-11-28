import type { VisitCancelledStore, VisitResolver } from '../domain/visit/visit.ts';
import { Visit } from '../domain/visit/visit.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ visitId: string; reason: string; operatedBy: string }>;

export type CancelVisitUseCase = UseCase<Input, void>;

type Deps = Readonly<{
  visitResolver: VisitResolver;
  visitCancelledStore: VisitCancelledStore;
  transaction: <T>(run: () => T) => T;
  now: () => Date;
}>;

const create = ({ visitResolver, visitCancelledStore, transaction, now }: Deps): CancelVisitUseCase => ({
  run: (input) =>
    transaction(() => {
      const visit = visitResolver.resolve(input.visitId);
      const event = Visit.cancel(visit, input, now());
      visitCancelledStore.store(event);
    }),
});

export const CancelVisitUseCase = { create } as const;
