import { Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { TranslatePostUseCase } from '../../useCase/translatePost.ts';
import type { Translation } from '../mastodon/entities.ts';
import { sanitizeStatusContent } from '../mastodon/sanitizeContent.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonTranslateRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  translatePost: TranslatePostUseCase;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const notAllowed = { error: 'This action is not allowed' } as const;
const serviceUnavailable = { error: 'Service Unavailable' } as const;
const readStatuses = Scope.orThrow('read:statuses');

export const createWorkerMastodonTranslateRouter = ({
  authn,
  actorResolverByUserId,
  translatePost,
}: WorkerMastodonTranslateRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/v1/statuses/:id/translate', authn.requireUser(readStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const postId = PostId.parse(c.req.param('id'));
      if (!postId.ok) {
        return c.json(recordNotFound, 404);
      }
      const viewer = await actorResolverByUserId.resolve(userId);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      if (viewer.val === undefined) {
        return c.json(actorNotFound, 422);
      }
      const lang = bodyString(await readRequestBody(c), 'lang');
      const translated = await translatePost.run({
        postId: postId.val,
        viewer: { userId, actorId: viewer.val.id },
        targetLanguage: lang === undefined || lang === '' ? undefined : lang,
      });
      if (!translated.ok) {
        switch (translated.err.type) {
          case 'PostNotFoundError':
            return c.json(recordNotFound, 404);
          case 'TranslationNotAllowedError':
            return c.json(notAllowed, 403);
          case 'TranslationLimitExceededError':
            c.header('Retry-After', String(translated.err.retryAfterSeconds));
            return c.json({ error: translated.err.message }, 429);
          case 'AiError':
          case 'TranslationTimeoutError':
          case 'TranslationAiUnavailableError':
            console.warn(`post translation failed: ${translated.err.type}: ${translated.err.message.slice(0, 200)}`);
            return c.json(serviceUnavailable, 503);
        }
      }
      const translation: Translation = {
        content: sanitizeStatusContent(translated.val.content),
        spoiler_text: '',
        language: 'ja',
        detected_source_language: translated.val.detectedSourceLanguage,
        provider: translated.val.provider,
        media_attachments: [],
        poll: null,
      };
      return c.json(translation);
    });
