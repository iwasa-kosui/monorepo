import type { IoriBlueskyCrosspost } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { PostVisibility } from './postVisibility.ts';

export type BlueskyCrosspostMark = Readonly<{
  label: string;
  title: string;
  emphasized: boolean;
  href: string | null;
}>;

const skipReasonTexts: Readonly<Record<NonNullable<IoriBlueskyCrosspost['skip_reason']>, string>> = {
  visibility: '公開範囲が公開ではないため Bluesky に送っていません',
  content_warning: 'CW 付きの投稿は Bluesky に送りません',
  sensitive: 'センシティブ指定の投稿は Bluesky に送りません',
  reply_to_unsent: '返信先が Bluesky にないため送っていません',
};

export const skipReasonText = (reason: IoriBlueskyCrosspost['skip_reason']): string | undefined =>
  reason === null ? undefined : skipReasonTexts[reason];

export const toBlueskyCrosspostMark = (crosspost: IoriBlueskyCrosspost): BlueskyCrosspostMark | undefined => {
  switch (crosspost.status) {
    case 'sent':
      return { label: 'Bluesky', title: 'Bluesky に投稿しました', emphasized: false, href: crosspost.url };
    case 'pending':
      return { label: 'Bluesky 送信中', title: 'Bluesky に送信しています', emphasized: false, href: null };
    case 'failed':
      return crosspost.retrying
        ? {
          label: 'Bluesky 再送待ち',
          title: 'Bluesky への送信に失敗しました。あとで再送します',
          emphasized: false,
          href: null,
        }
        : {
          label: 'Bluesky に届いていません',
          title: 'Bluesky への送信に失敗し、再送も終わりました',
          emphasized: true,
          href: null,
        };
    case 'skipped':
      if (crosspost.skip_reason === 'reply_to_unsent') return undefined;
      return {
        label: 'Bluesky に未送信',
        title: skipReasonText(crosspost.skip_reason) ?? 'Bluesky には送っていません',
        emphasized: false,
        href: null,
      };
    case 'deleting':
      return undefined;
  }
};

export const postedMessage = (
  destination: PostDestination,
  crosspost: IoriBlueskyCrosspost | undefined,
): string => {
  if (crosspost?.status === 'pending') return '投稿しました。Bluesky には送信中です';
  if (crosspost?.status === 'sent') return '投稿しました（Bluesky にも送りました）';
  if (crosspost?.status === 'failed') {
    return crosspost.retrying
      ? '投稿しました。Bluesky への送信に失敗しました（あとで再送します）'
      : '投稿しました。Bluesky には届いていません';
  }
  if (crosspost?.status === 'skipped') {
    const reason = skipReasonText(crosspost.skip_reason);
    return `Fediverse に投稿しました。Bluesky には送っていません${reason === undefined ? '' : `（${reason}）`}`;
  }
  return destination === 'fediverse' ? 'Fediverse に投稿しました' : '投稿しました';
};

export const BLUESKY_NOT_SENT_NOTICE = 'CW 付き・センシティブ指定の投稿は Bluesky に送りません';

export const BLUESKY_NOT_SENT_VISIBILITY_NOTICE = '公開範囲が公開ではないので、Bluesky には送りません';

export const blueskyNotSentNotice = (
  destination: PostDestination,
  cw: string,
  sensitive: boolean,
  visibility: PostVisibility,
): string | undefined => {
  if (destination !== 'both') return undefined;
  if (cw.trim() !== '' || sensitive) return BLUESKY_NOT_SENT_NOTICE;
  return visibility !== 'public' ? BLUESKY_NOT_SENT_VISIBILITY_NOTICE : undefined;
};
