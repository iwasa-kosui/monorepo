import type { IoriBlueskyCrosspost, Status } from '../../adaptor/mastodon/entities.ts';
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
  content_warning: 'この投稿の当時は、CW 付きの投稿を Bluesky に送っていませんでした',
  sensitive: 'この投稿の当時は、センシティブ指定の投稿を Bluesky に送っていませんでした',
  reply_to_unsent: '返信先が Bluesky にないため送っていません',
};

export const skipReasonText = (reason: IoriBlueskyCrosspost['skip_reason']): string | undefined =>
  reason === null ? undefined : skipReasonTexts[reason];

const isDirectVisibilitySkip = (
  crosspost: IoriBlueskyCrosspost,
  visibility: Status['visibility'] | undefined,
): boolean => visibility === 'direct' && crosspost.skip_reason === 'visibility';

export const toBlueskyCrosspostMark = (
  crosspost: IoriBlueskyCrosspost,
  visibility?: Status['visibility'],
): BlueskyCrosspostMark | undefined => {
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
      if (crosspost.skip_reason === 'reply_to_unsent' || isDirectVisibilitySkip(crosspost, visibility)) {
        return undefined;
      }
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
  visibility?: Status['visibility'],
): string => {
  if (crosspost?.status === 'pending') return '投稿しました。Bluesky には送信中です';
  if (crosspost?.status === 'sent') return '投稿しました（Bluesky にも送りました）';
  if (crosspost?.status === 'failed') {
    return crosspost.retrying
      ? '投稿しました。Bluesky への送信に失敗しました（あとで再送します）'
      : '投稿しました。Bluesky には届いていません';
  }
  if (crosspost?.status === 'skipped') {
    const reason = isDirectVisibilitySkip(crosspost, visibility) ? undefined : skipReasonText(crosspost.skip_reason);
    return `Fediverse に投稿しました。Bluesky には送っていません${reason === undefined ? '' : `（${reason}）`}`;
  }
  return destination === 'fediverse' ? 'Fediverse に投稿しました' : '投稿しました';
};

export const BLUESKY_ONLY_POSTED_MESSAGE = 'Bluesky に投稿しました';

export const BLUESKY_CONTENT_WARNING_NOTICE = 'Bluesky には CW の文と投稿へのリンクだけを送ります';
export const BLUESKY_SENSITIVE_NOTICE = 'Bluesky には画像に注意のラベルを付けて送ります';
export const BLUESKY_NOT_SENT_VISIBILITY_NOTICE = '公開範囲が公開ではないので、Bluesky には送りません';

export const blueskyCrosspostNotice = (
  destination: PostDestination,
  cw: string,
  sensitive: boolean,
  visibility: PostVisibility,
): string | undefined => {
  if (destination !== 'both') return undefined;
  if (visibility !== 'public') return BLUESKY_NOT_SENT_VISIBILITY_NOTICE;
  if (cw.trim() !== '') return BLUESKY_CONTENT_WARNING_NOTICE;
  return sensitive ? BLUESKY_SENSITIVE_NOTICE : undefined;
};

export const BLUESKY_EDIT_NOT_APPLIED_NOTICE = 'Bluesky に送った投稿は変わらず、編集前の内容のまま残ります';
export const BLUESKY_EDIT_NOT_SENT_YET_NOTICE = 'Bluesky にはまだ送っていません。送るときは編集後の内容を送ります';

export const blueskyEditNotice = (status: Pick<Status, 'iori'>): string | undefined => {
  switch (status.iori?.bluesky_crosspost?.status) {
    case 'sent':
      return BLUESKY_EDIT_NOT_APPLIED_NOTICE;
    case 'pending':
    case 'failed':
      return BLUESKY_EDIT_NOT_SENT_YET_NOTICE;
    default:
      return undefined;
  }
};
