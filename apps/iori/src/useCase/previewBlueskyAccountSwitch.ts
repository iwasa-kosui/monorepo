import type {
  BlueskyAccountSwitchPreview,
  BlueskyAccountSwitchPreviewResolver,
} from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { UseCase } from './useCase.ts';

export type PreviewBlueskyAccountSwitchUseCase = UseCase<void, BlueskyAccountSwitchPreview, never>;

type Deps = Readonly<{
  previewResolver: BlueskyAccountSwitchPreviewResolver;
}>;

const create = ({ previewResolver }: Deps): PreviewBlueskyAccountSwitchUseCase => ({
  run: () => previewResolver.resolve(),
});

export const PreviewBlueskyAccountSwitchUseCase = { create } as const;
