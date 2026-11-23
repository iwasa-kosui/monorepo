import type { Result } from '@iwasa-kosui/result';

import type { UserId } from '../../domain/user/userId.ts';
import type { RequestDigestUseCase } from '../requestDigest.ts';
import type { InferUseCaseError } from '../useCase.ts';
import type { AgentTool } from './agentLoop.ts';

export type DigestSent = Readonly<{ topics: number; items: number }>;

export type DigestSendFailure = InferUseCaseError<RequestDigestUseCase>;

export type SendDigest = () => Promise<Result<DigestSent, DigestSendFailure>>;

export type SendDigestTo = (userId: UserId) => Promise<Result<DigestSent, DigestSendFailure>>;

const SECONDS_PER_MINUTE = 60;

const failureMessage = (failure: DigestSendFailure): string => {
  if (!('type' in failure)) return 'エラー: ダイジェストを送れませんでした。';
  switch (failure.type) {
    case 'DigestRequestLimitError':
      if (failure.reason === 'daily_limit') return 'エラー: 今日はもうダイジェストを送れません。';
      return `エラー: 前の依頼から間もないため、いまは送れません。${
        Math.max(1, Math.ceil(failure.retryAfterSeconds / SECONDS_PER_MINUTE))
      } 分ほど待ってから、もう一度頼んでほしいと伝えてください。`;
    case 'DigestTopicsUnavailableError':
      return 'エラー: ダイジェストのトピックの準備ができていないため、送れません。';
    default:
      return 'エラー: ダイジェストを送れませんでした。';
  }
};

export const createDigestTool = (send: SendDigest): AgentTool => {
  let used = false;
  return {
    name: 'send_digest',
    description: [
      'ダイジェストを、あなたから相手への DM として送る。引数はない。',
      'ダイジェストを送るよう頼まれたときだけ使う。ダイジェストは別の DM のスレッドで届く。',
    ].join(''),
    parameters: { type: 'object', properties: {}, required: [] },
    run: async () => {
      if (used) return 'エラー: この実行では、すでにダイジェストを送る操作をしています。';
      used = true;
      const result = await send();
      if (!result.ok) return failureMessage(result.err);
      return `ダイジェストを DM で送りました。トピックは ${result.val.topics} 件、項目は ${result.val.items} 件です。`;
    },
  };
};
