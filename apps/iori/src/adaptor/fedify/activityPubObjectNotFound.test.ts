import type { Federation } from '@fedify/fedify';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { federationWithObjectNotFound, isActivityPubObjectRequest } from './activityPubObjectNotFound.ts';

const articleId = '3f1d6a52-8c1e-4b6a-9d0e-5a7c2b9e1f40';
const request = (path: string, accept?: string) =>
  new Request(`https://iori.example${path}`, accept === undefined ? undefined : { headers: { Accept: accept } });
const articlePath = `/users/kosui/articles/${articleId}`;
const ldJson = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

describe('isActivityPubObjectRequest', () => {
  it('accepts the article object path with application/activity+json', () => {
    expect(isActivityPubObjectRequest(request(articlePath, 'application/activity+json'))).toBe(true);
  });

  it('accepts the article object path with ld+json, with or without the ActivityStreams profile', () => {
    expect(isActivityPubObjectRequest(request(articlePath, ldJson))).toBe(true);
    expect(isActivityPubObjectRequest(request(articlePath, ldJson.replace(/"/g, '')))).toBe(true);
    expect(isActivityPubObjectRequest(request(articlePath, 'application/ld+json'))).toBe(true);
    expect(
      isActivityPubObjectRequest(request(articlePath, 'application/ld+json; profile="https://example.com/other"')),
    ).toBe(true);
  });

  it('accepts the article object path with application/json', () => {
    expect(isActivityPubObjectRequest(request(articlePath, 'application/json'))).toBe(true);
  });

  it('rejects when the first preferred type is text/html or application/xhtml+xml', () => {
    expect(isActivityPubObjectRequest(request(articlePath, 'text/html'))).toBe(false);
    expect(isActivityPubObjectRequest(request(articlePath, 'application/xhtml+xml'))).toBe(false);
    expect(isActivityPubObjectRequest(request(articlePath, 'text/html,application/xhtml+xml,*/*;q=0.8'))).toBe(false);
    expect(isActivityPubObjectRequest(request(articlePath, 'text/html, application/ld+json'))).toBe(false);
  });

  it('rejects wildcard, an unrelated type, and a missing Accept header', () => {
    expect(isActivityPubObjectRequest(request(articlePath, '*/*'))).toBe(false);
    expect(isActivityPubObjectRequest(request(articlePath, 'text/plain'))).toBe(false);
    expect(isActivityPubObjectRequest(request(articlePath))).toBe(false);
  });

  it('follows the highest quality value when both HTML and ActivityPub are listed', () => {
    expect(isActivityPubObjectRequest(request(articlePath, 'text/html, application/activity+json;q=0.9'))).toBe(
      false,
    );
    expect(isActivityPubObjectRequest(request(articlePath, 'application/activity+json, text/html;q=0.9'))).toBe(true);
    expect(isActivityPubObjectRequest(request(articlePath, 'text/html;q=0.5, application/ld+json'))).toBe(true);
    expect(isActivityPubObjectRequest(request(articlePath, 'application/activity+json;q=0'))).toBe(false);
  });

  it('ignores the query string', () => {
    expect(isActivityPubObjectRequest(request(`${articlePath}?foo=bar`, 'application/activity+json'))).toBe(true);
  });

  it('rejects a trailing slash because Fedify does not route it', () => {
    expect(isActivityPubObjectRequest(request(`${articlePath}/`, 'application/activity+json'))).toBe(false);
  });

  it('rejects other paths', () => {
    expect(isActivityPubObjectRequest(request('/users/kosui', 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request('/users/kosui/articles', 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request(`/users/kosui/articles/${articleId}/edit`, 'application/activity+json')))
      .toBe(false);
    expect(isActivityPubObjectRequest(request(`/articles/${articleId}`, 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request(`/users/kosui/notes/${articleId}`, 'application/activity+json'))).toBe(
      false,
    );
  });
});

describe('isActivityPubObjectRequest for the post object path', () => {
  const postPath = `/users/kosui/posts/${articleId}`;

  it('accepts the post object path with the ActivityPub media types', () => {
    expect(isActivityPubObjectRequest(request(postPath, 'application/activity+json'))).toBe(true);
    expect(isActivityPubObjectRequest(request(postPath, ldJson))).toBe(true);
    expect(isActivityPubObjectRequest(request(postPath, 'application/json'))).toBe(true);
  });

  it('rejects a trailing slash because Fedify does not route it', () => {
    expect(isActivityPubObjectRequest(request(`${postPath}/`, 'application/activity+json'))).toBe(false);
  });

  it('rejects the posts collection path, extra segments, and other prefixes', () => {
    expect(isActivityPubObjectRequest(request('/users/kosui/posts', 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request('/users/kosui/posts/', 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request(`${postPath}/y`, 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request(`${postPath}/edit`, 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request(`/posts/${articleId}`, 'application/activity+json'))).toBe(false);
    expect(isActivityPubObjectRequest(request(`/users//posts/${articleId}`, 'application/activity+json'))).toBe(false);
  });
});

describe('federationWithObjectNotFound for POST requests', () => {
  const setup = () => {
    const fetch = vi.fn(async () => new Response('federated', { status: 202 }));
    const app = new Hono();
    app.use('*', federationWithObjectNotFound({ fetch } as unknown as Federation<void>, () => undefined));
    app.all('*', (c) => c.text('next'));
    const post = (path: string, accept?: string) =>
      app.request(`https://iori.example${path}`, {
        method: 'POST',
        headers: accept === undefined ? undefined : { Accept: accept },
        body: '{}',
      });
    return { fetch, post };
  };

  it('does not pass a POST to a non-inbox path to Fedify even with Accept: application/activity+json', async () => {
    const { fetch, post } = setup();

    const response = await post('/users/x', 'application/activity+json');

    expect(fetch).not.toHaveBeenCalled();
    expect(await response.text()).toBe('next');
  });

  it('passes a POST to the shared inbox to Fedify', async () => {
    const { fetch, post } = setup();

    const response = await post('/inbox');

    expect(fetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(202);
  });

  it('passes a POST to a personal inbox to Fedify', async () => {
    const { fetch, post } = setup();

    const response = await post('/users/x/inbox');

    expect(fetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(202);
  });
});
