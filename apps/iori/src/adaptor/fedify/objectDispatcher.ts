import type { RequestContext } from '@fedify/fedify';

import { Env } from '../../env.ts';
import { PgArticleBodyResolver } from '../pg/article/articleBodyResolver.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgPostImagesResolverByPostId } from '../pg/image/postImagesResolver.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';
import { PgUserResolverByUsername } from '../pg/user/userResolverByUsername.ts';
import { createObjectDispatcher } from './objectDispatcherFactory.ts';

export { createObjectDispatcher, type ObjectDispatcherDeps } from './objectDispatcherFactory.ts';

const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) =>
  createObjectDispatcher({
    origin: Env.getInstance().ORIGIN,
    postResolver: PgPostResolver.getInstance(),
    postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
    articleBodyResolver: PgArticleBodyResolver.getInstance(),
  }).ofNote(ctx, values);

const ofArticle = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) =>
  createObjectDispatcher({
    origin: Env.getInstance().ORIGIN,
    postResolver: PgPostResolver.getInstance(),
    postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
    articleResolver: PgArticleResolver.getInstance(),
    threadResolver: PgThreadResolver.getInstance(),
    articleBodyResolver: PgArticleBodyResolver.getInstance(),
  }).ofArticle(ctx, values);

export const ObjectDispatcher = {
  ofNote,
  ofArticle,
} as const;
