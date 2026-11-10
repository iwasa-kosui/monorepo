import type { Context } from 'hono';
import { Hono } from 'hono';

import { MediaId } from '../../domain/mediaUpload/mediaId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { GetMediaUploadUseCase } from '../../useCase/getMediaUpload.ts';
import type { UpdateMediaDescriptionUseCase } from '../../useCase/updateMediaDescription.ts';
import type { UploadMediaUseCase } from '../../useCase/uploadMedia.ts';
import { toMediaAttachment } from '../mastodon/toMediaAttachment.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonMediaRouterDeps = Readonly<{
  authn: MastodonAuthn;
  uploadMediaUseCase: UploadMediaUseCase;
  getMediaUploadUseCase: GetMediaUploadUseCase;
  updateMediaDescriptionUseCase: UpdateMediaDescriptionUseCase;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const writeMedia = Scope.orThrow('write:media');

const validationFailed = (message: string) => ({ error: `Validation failed: ${message}` });

const requesterOf = (c: Context<MastodonAuthEnv>): UserId | undefined => getMastodonPrincipal(c)?.userId ?? undefined;

export const createWorkerMastodonMediaRouter = ({
  authn,
  uploadMediaUseCase,
  getMediaUploadUseCase,
  updateMediaDescriptionUseCase,
}: WorkerMastodonMediaRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/v2/media', authn.requireUser(writeMedia), async (c) => {
      const userId = requesterOf(c);
      if (userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const body = await readRequestBody(c);
      const file = body['file'];
      if (!(file instanceof File)) {
        return c.json(validationFailed('File is required'), 422);
      }
      const result = await uploadMediaUseCase.run({
        userId,
        bytes: new Uint8Array(await file.arrayBuffer()),
        description: bodyString(body, 'description'),
      });
      if (result.ok) {
        return c.json(toMediaAttachment(result.val));
      }
      return result.err.type === 'UserNotFoundError'
        ? c.json(invalidToken, 401)
        : c.json(validationFailed(result.err.message), 422);
    })
    .get('/v1/media/:id', authn.requireUser(writeMedia), async (c) => {
      const userId = requesterOf(c);
      if (userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const mediaId = MediaId.parse(c.req.param('id'));
      if (!mediaId.ok) {
        return c.json(recordNotFound, 404);
      }
      const result = await getMediaUploadUseCase.run({ userId, mediaId: mediaId.val });
      return result.ok ? c.json(toMediaAttachment(result.val)) : c.json(recordNotFound, 404);
    })
    .put('/v1/media/:id', authn.requireUser(writeMedia), async (c) => {
      const userId = requesterOf(c);
      if (userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const mediaId = MediaId.parse(c.req.param('id'));
      if (!mediaId.ok) {
        return c.json(recordNotFound, 404);
      }
      const body = await readRequestBody(c);
      const description = body['description'] === null ? null : bodyString(body, 'description');
      const result = description === undefined
        ? await getMediaUploadUseCase.run({ userId, mediaId: mediaId.val })
        : await updateMediaDescriptionUseCase.run({ userId, mediaId: mediaId.val, description });
      if (result.ok) {
        return c.json(toMediaAttachment(result.val));
      }
      return result.err.type === 'MediaNotFoundError'
        ? c.json(recordNotFound, 404)
        : c.json(validationFailed(result.err.message), 422);
    });
