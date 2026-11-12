import type { AccountProfilesResolverByActorIds } from '../../domain/actor/accountProfile.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import { Post, type PostWithAuthor } from '../../domain/post/post.ts';
import type { PostExtras, PostExtrasResolverByPosts } from '../../domain/post/postExtras.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { RepostId } from '../../domain/repost/repostId.ts';
import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';
import { defaultImageUrls } from './defaultImages.ts';
import type { Account, Status } from './entities.ts';
import { type AccountSource, toAccount } from './toAccount.ts';
import { toReblogStatus, toStatus, type ToStatusOptions } from './toStatus.ts';

export type StatusSource =
  | Readonly<{ type: 'post'; post: PostWithAuthor }>
  | Readonly<{
    type: 'repost';
    repostId: RepostId;
    reposterActorId: ActorId;
    createdAt: Instant;
    post: PostWithAuthor;
  }>;

export const statusSourceOfTimelineItem = (item: TimelineItemWithPost): StatusSource =>
  item.type === 'post'
    ? { type: 'post', post: item.post }
    : {
      type: 'repost',
      repostId: item.repostId,
      reposterActorId: item.repostedBy.actorId,
      createdAt: item.createdAt,
      post: item.post,
    };

export type StatusAssemblerDeps = Readonly<{
  accountProfilesResolver: AccountProfilesResolverByActorIds;
  postExtrasResolver: PostExtrasResolverByPosts;
}>;

export type AssembleInput = Readonly<{
  sources: ReadonlyArray<StatusSource>;
  viewerActorId: ActorId | undefined;
  requestUrl: string;
}>;

export type StatusAssembler = Readonly<{
  assemble: (input: AssembleInput) => Promise<Status[]>;
  assembleAccounts: (
    input: Readonly<{ actorIds: ReadonlyArray<ActorId>; requestUrl: string }>,
  ) => Promise<Account[]>;
}>;

export const statusSourceId = (source: StatusSource): string =>
  source.type === 'repost' ? source.repostId : source.post.postId;

export const isSourceVisibleToAnonymous = (source: StatusSource): boolean => Post.isVisibleToAnonymous(source.post);

export class StatusAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatusAssemblyError';
  }
}

export const createStatusAssembler = (
  { accountProfilesResolver, postExtrasResolver }: StatusAssemblerDeps,
): StatusAssembler => {
  const resolveAccounts = async (
    actorIds: ReadonlyArray<ActorId>,
    requestUrl: string,
  ): Promise<ReadonlyMap<ActorId, Account>> => {
    const profiles = await accountProfilesResolver.resolve(actorIds);
    if (!profiles.ok) throw new StatusAssemblyError('Failed to resolve account profiles');
    const options = defaultImageUrls(requestUrl);
    return new Map([...profiles.val].map(([actorId, profile]) => {
      const source: AccountSource = profile.type === 'local'
        ? { type: 'local', user: profile.user, actor: profile.actor }
        : { type: 'remote', actor: profile.actor };
      return [actorId, toAccount(source, { ...options, baseUrl: requestUrl, ...profile.stats })];
    }));
  };

  const assemble = async ({ sources, viewerActorId, requestUrl }: AssembleInput): Promise<Status[]> => {
    const toStatusOptions = (
      post: PostWithAuthor,
      account: Account,
      postExtras: PostExtras | undefined,
      quote: ToStatusOptions['quote'],
    ): ToStatusOptions => ({
      baseUrl: requestUrl,
      account,
      mediaAttachmentIds: post.images.map((image) => image.imageId),
      repliesCount: postExtras?.repliesCount ?? 0,
      inReplyToId: postExtras?.inReplyTo?.postId ?? null,
      inReplyToAccountId: postExtras?.inReplyTo?.actorId ?? null,
      myReactionEmojis: new Set(postExtras?.myReactionEmojis ?? []),
      bookmarked: postExtras?.bookmarked ?? false,
      blueskyCrosspost: postExtras?.blueskyCrosspost ?? null,
      quote,
    });

    const posts = [...new Map(sources.map((source) => [source.post.postId, source.post])).values()];
    const actorIds = [
      ...new Set(
        sources.flatMap((source) =>
          source.type === 'repost' ? [source.post.actorId, source.reposterActorId] : [source.post.actorId]
        ),
      ),
    ];
    const [extras, accounts] = await Promise.all([
      postExtrasResolver.resolve({ posts, currentActorId: viewerActorId }),
      resolveAccounts(actorIds, requestUrl),
    ]);
    if (!extras.ok) throw new StatusAssemblyError('Failed to resolve post extras');
    const extrasByPostId: ReadonlyMap<PostId, PostExtras> = extras.val;

    const quotedPosts = [
      ...new Map(
        [...extrasByPostId.values()].flatMap((postExtras) =>
          postExtras.quote?.post == null ? [] : [[postExtras.quote.post.postId, postExtras.quote.post] as const]
        ),
      ).values(),
    ];
    const quotedStatusByPostId = new Map<PostId, Status>();
    if (quotedPosts.length > 0) {
      const missingActorIds = [...new Set(quotedPosts.map((post) => post.actorId))].filter((id) => !accounts.has(id));
      const [quotedExtras, quotedAccounts] = await Promise.all([
        postExtrasResolver.resolve({ posts: quotedPosts, currentActorId: viewerActorId }),
        resolveAccounts(missingActorIds, requestUrl),
      ]);
      if (!quotedExtras.ok) throw new StatusAssemblyError('Failed to resolve post extras');
      for (const post of quotedPosts) {
        const account = accounts.get(post.actorId) ?? quotedAccounts.get(post.actorId);
        if (account === undefined) continue;
        quotedStatusByPostId.set(
          post.postId,
          toStatus(post, toStatusOptions(post, account, quotedExtras.val.get(post.postId), null)),
        );
      }
    }

    const statusByPostId = new Map<PostId, Status>();
    for (const post of posts) {
      const account = accounts.get(post.actorId);
      if (account === undefined) continue;
      const postExtras = extrasByPostId.get(post.postId);
      const quote = postExtras?.quote ?? null;
      statusByPostId.set(
        post.postId,
        toStatus(
          post,
          toStatusOptions(
            post,
            account,
            postExtras,
            quote === null
              ? null
              : {
                uri: quote.uri,
                status: quote.post === null ? null : quotedStatusByPostId.get(quote.post.postId) ?? null,
              },
          ),
        ),
      );
    }

    return sources.flatMap((source): Status[] => {
      const status = statusByPostId.get(source.post.postId);
      if (status === undefined) return [];
      if (source.type === 'post') return [status];
      const reposter = accounts.get(source.reposterActorId);
      return reposter === undefined
        ? []
        : [
          toReblogStatus({ createdAt: source.createdAt }, {
            repostId: source.repostId,
            account: reposter,
            reblog: status,
          }),
        ];
    });
  };

  const assembleAccounts: StatusAssembler['assembleAccounts'] = async ({ actorIds, requestUrl }) => {
    const accounts = await resolveAccounts(actorIds, requestUrl);
    return actorIds.flatMap((actorId) => {
      const account = accounts.get(actorId);
      return account === undefined ? [] : [account];
    });
  };

  return { assemble, assembleAccounts };
};
