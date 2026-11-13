import { RA } from '@iwasa-kosui/result';

import {
  BlueskyAccountSwitch,
  type BlueskyAccountSwitchResolver,
  type BlueskyAccountSwitchView,
} from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { UseCase } from './useCase.ts';

export type GetBlueskyAccountSwitchUseCase = UseCase<void, BlueskyAccountSwitchView, never>;

type Deps = Readonly<{
  accountSwitchResolver: BlueskyAccountSwitchResolver;
}>;

const create = ({ accountSwitchResolver }: Deps): GetBlueskyAccountSwitchUseCase => {
  const run = async (): RA<BlueskyAccountSwitchView, never> => {
    const resolved = await accountSwitchResolver.resolve();
    return RA.ok(BlueskyAccountSwitch.toView(resolved.ok ? resolved.val : undefined));
  };

  return { run };
};

export const GetBlueskyAccountSwitchUseCase = { create } as const;
