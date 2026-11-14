import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { UPLOAD_IMAGE_MAX_BYTES } from '../../../domain/image/uploadImage.ts';
import type { MediaUpload } from '../../../domain/mediaUpload/mediaUpload.ts';
import { GetMediaUploadUseCase } from '../../../useCase/getMediaUpload.ts';
import { UpdateMediaDescriptionUseCase } from '../../../useCase/updateMediaDescription.ts';
import { UploadMediaUseCase } from '../../../useCase/uploadMedia.ts';
import { MediaAttachmentSchema } from '../../mastodon/entities.ts';
import { createPostImageR2ObjectStore } from '../../r2/postImageObjectStore.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerMastodonFallbackRouter } from '../workerMastodonFallbackRouter.ts';
import { createWorkerMastodonMediaRouter } from '../workerMastodonMediaRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const pngBytes = (size = 16) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
};

const filePart = (bytes: Uint8Array<ArrayBuffer>, type = 'image/png') => new File([bytes], 'photo', { type });

const multipart = (values: Record<string, string | File>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return body;
};

const setup = () => {
  const h = createOAuthHarness();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: h.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: h.memory.sessionResolver as never,
  });
  const users = new Set<string>();
  const medias = new Map<string, MediaUpload>();
  const bucket = { put: vi.fn(async () => undefined), get: vi.fn() };
  const uploads = createPostImageR2ObjectStore({ bucket: bucket as never });
  const userResolver = {
    resolve: (userId: string) => RA.ok(users.has(userId) ? { id: userId, username: 'kosui' } : undefined),
  } as never;
  const mediaUploadResolver = { resolve: (mediaId: string) => RA.ok(medias.get(mediaId)) } as never;
  const remember = async (...events: ReadonlyArray<{ aggregateState: MediaUpload }>) => {
    for (const event of events) medias.set(event.aggregateState.mediaId, event.aggregateState);
    return RA.ok(undefined);
  };
  const router = createWorkerMastodonMediaRouter({
    authn,
    uploadMediaUseCase: UploadMediaUseCase.create({
      userResolver,
      uploads,
      mediaUploadCreatedStore: { store: remember },
      origin: ORIGIN,
    }),
    getMediaUploadUseCase: GetMediaUploadUseCase.create({ mediaUploadResolver }),
    updateMediaDescriptionUseCase: UpdateMediaDescriptionUseCase.create({
      mediaUploadResolver,
      mediaUploadDescriptionUpdatedStore: { store: remember },
    }),
  });
  const app = createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (root) => {
      root.route('/api', router);
      root.route('/api', createWorkerMastodonFallbackRouter());
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('og', { status: 200 }),
  });
  const request = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${path}`, init);
  const user = async (scope = 'write:media') => {
    const issued = await h.issueUserToken(scope);
    users.add(issued.userId);
    return { ...issued, headers: { Authorization: `Bearer ${issued.token}` } };
  };
  const upload = async (headers: Record<string, string>, values: Record<string, string | File>) =>
    request('/api/v2/media', { method: 'POST', headers, body: multipart(values) });
  return { request, user, upload, bucket, medias, h };
};

describe('POST /api/v2/media', () => {
  it('画像を R2 に保存して MediaAttachment を 200 で返し、media_uploads に記録する', async () => {
    const s = setup();
    const { headers, userId } = await s.user();

    const response = await s.upload(headers, { file: filePart(pngBytes()), description: '猫の写真' });

    expect(response.status).toBe(200);
    const body = MediaAttachmentSchema.parse(await response.json());
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'image',
      url: expect.stringMatching(new RegExp(`^${ORIGIN}/uploads/${body.id}\\.png$`)),
      preview_url: body.url,
      remote_url: null,
      description: '猫の写真',
      meta: null,
      blurhash: null,
    });
    expect(s.medias.get(body.id)).toMatchObject({
      userId,
      url: body.url,
      mimeType: 'image/png',
      description: '猫の写真',
    });
  });

  it('申告の type が違っても、先頭のバイトで形式を決める', async () => {
    const s = setup();
    const { headers } = await s.user();

    const response = await s.upload(headers, { file: filePart(pngBytes(), 'image/gif') });

    expect(response.status).toBe(200);
    expect((await response.json() as { url: string }).url).toMatch(/\.png$/);
  });

  it.each([
    [
      '申告は画像でも中身が画像でない',
      () => ({ file: filePart(new TextEncoder().encode('<html></html>'), 'image/png') }),
    ],
    ['5MB を超える', () => ({ file: filePart(pngBytes(UPLOAD_IMAGE_MAX_BYTES + 1)) })],
    ['file がない', () => ({ description: 'だけ' })],
  ])('%s場合は 422 にして、保存しない', async (_name, values) => {
    const s = setup();
    const { headers } = await s.user();

    const response = await s.upload(headers, values());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: expect.stringContaining('Validation failed') });
    expect(s.bucket.put).not.toHaveBeenCalled();
    expect(s.medias.size).toBe(0);
  });

  it('認証がなければ 401 にする', async () => {
    const s = setup();

    const response = await s.upload({}, { file: filePart(pngBytes()) });

    expect(response.status).toBe(401);
    expect(s.bucket.put).not.toHaveBeenCalled();
  });

  it('write:media がないトークンは 403 にする', async () => {
    const s = setup();
    const { headers } = await s.user('read write:statuses');

    const response = await s.upload(headers, { file: filePart(pngBytes()) });

    expect(response.status).toBe(403);
    expect(s.bucket.put).not.toHaveBeenCalled();
  });
});

describe('GET と PUT /api/v1/media/:id', () => {
  const uploadAs = async (s: ReturnType<typeof setup>, headers: Record<string, string>, description?: string) => {
    const response = await s.upload(headers, {
      file: filePart(pngBytes()),
      ...(description === undefined ? {} : { description }),
    });
    return await response.json() as { id: string };
  };

  it('本人は GET で MediaAttachment を取れる', async () => {
    const s = setup();
    const { headers } = await s.user();
    const { id } = await uploadAs(s, headers, '猫');

    const response = await s.request(`/api/v1/media/${id}`, { headers });

    expect(response.status).toBe(200);
    expect(MediaAttachmentSchema.parse(await response.json())).toMatchObject({ id, description: '猫' });
  });

  it('本人は PUT で説明を更新でき、GET にも反映される', async () => {
    const s = setup();
    const { headers } = await s.user();
    const { id } = await uploadAs(s, headers, '猫');

    const put = await s.request(`/api/v1/media/${id}`, {
      method: 'PUT',
      headers,
      body: multipart({ description: '犬' }),
    });
    const get = await s.request(`/api/v1/media/${id}`, { headers });

    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ id, description: '犬' });
    expect(await get.json()).toMatchObject({ id, description: '犬' });
  });

  it('JSON の本文でも PUT でき、description がなければ変えない', async () => {
    const s = setup();
    const { headers } = await s.user();
    const { id } = await uploadAs(s, headers, '猫');

    const json = await s.request(`/api/v1/media/${id}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: '鳥' }),
    });
    const unchanged = await s.request(`/api/v1/media/${id}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ focus: '0.0,0.0' }),
    });

    expect(await json.json()).toMatchObject({ description: '鳥' });
    expect(await unchanged.json()).toMatchObject({ description: '鳥' });
  });

  it('multipart の本文で description が空文字なら説明を消す', async () => {
    const s = setup();
    const { headers } = await s.user();
    const { id } = await uploadAs(s, headers, '猫');

    const response = await s.request(`/api/v1/media/${id}`, {
      method: 'PUT',
      headers,
      body: multipart({ description: '' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, description: null });
    expect(s.medias.get(id)?.description).toBeNull();
  });

  it('他人のメディアは GET も PUT も 404 にして、説明を変えない', async () => {
    const s = setup();
    const owner = await s.user();
    const other = await s.user();
    const { id } = await uploadAs(s, owner.headers, '猫');

    const get = await s.request(`/api/v1/media/${id}`, { headers: other.headers });
    const put = await s.request(`/api/v1/media/${id}`, {
      method: 'PUT',
      headers: other.headers,
      body: multipart({ description: '奪う' }),
    });

    expect([get.status, put.status]).toEqual([404, 404]);
    expect(s.medias.get(id)?.description).toBe('猫');
  });

  it('認証がなければ 401、write:media がなければ 403 にする', async () => {
    const s = setup();
    const owner = await s.user();
    const { id } = await uploadAs(s, owner.headers);
    const readOnly = await s.user('read');

    const anonymous = await s.request(`/api/v1/media/${id}`);
    const forbidden = await s.request(`/api/v1/media/${id}`, { headers: readOnly.headers });

    expect([anonymous.status, forbidden.status]).toEqual([401, 403]);
  });
});
