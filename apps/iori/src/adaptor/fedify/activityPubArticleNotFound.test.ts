import { describe, expect, it } from 'vitest';

import { isActivityPubArticleRequest } from './activityPubArticleNotFound.ts';

const articleId = '3f1d6a52-8c1e-4b6a-9d0e-5a7c2b9e1f40';
const request = (path: string, accept?: string) =>
  new Request(`https://iori.example${path}`, accept === undefined ? undefined : { headers: { Accept: accept } });
const articlePath = `/users/kosui/articles/${articleId}`;
const ldJson = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

describe('isActivityPubArticleRequest', () => {
  it('accepts the article object path with application/activity+json', () => {
    expect(isActivityPubArticleRequest(request(articlePath, 'application/activity+json'))).toBe(true);
  });

  it('accepts the article object path with ld+json, with or without the ActivityStreams profile', () => {
    expect(isActivityPubArticleRequest(request(articlePath, ldJson))).toBe(true);
    expect(isActivityPubArticleRequest(request(articlePath, ldJson.replace(/"/g, '')))).toBe(true);
    expect(isActivityPubArticleRequest(request(articlePath, 'application/ld+json'))).toBe(true);
    expect(
      isActivityPubArticleRequest(request(articlePath, 'application/ld+json; profile="https://example.com/other"')),
    ).toBe(true);
  });

  it('accepts the article object path with application/json', () => {
    expect(isActivityPubArticleRequest(request(articlePath, 'application/json'))).toBe(true);
  });

  it('rejects when the first preferred type is text/html or application/xhtml+xml', () => {
    expect(isActivityPubArticleRequest(request(articlePath, 'text/html'))).toBe(false);
    expect(isActivityPubArticleRequest(request(articlePath, 'application/xhtml+xml'))).toBe(false);
    expect(isActivityPubArticleRequest(request(articlePath, 'text/html,application/xhtml+xml,*/*;q=0.8'))).toBe(false);
    expect(isActivityPubArticleRequest(request(articlePath, 'text/html, application/ld+json'))).toBe(false);
  });

  it('rejects wildcard, an unrelated type, and a missing Accept header', () => {
    expect(isActivityPubArticleRequest(request(articlePath, '*/*'))).toBe(false);
    expect(isActivityPubArticleRequest(request(articlePath, 'text/plain'))).toBe(false);
    expect(isActivityPubArticleRequest(request(articlePath))).toBe(false);
  });

  it('follows the highest quality value when both HTML and ActivityPub are listed', () => {
    expect(isActivityPubArticleRequest(request(articlePath, 'text/html, application/activity+json;q=0.9'))).toBe(
      false,
    );
    expect(isActivityPubArticleRequest(request(articlePath, 'application/activity+json, text/html;q=0.9'))).toBe(true);
    expect(isActivityPubArticleRequest(request(articlePath, 'text/html;q=0.5, application/ld+json'))).toBe(true);
    expect(isActivityPubArticleRequest(request(articlePath, 'application/activity+json;q=0'))).toBe(false);
  });

  it('ignores the query string', () => {
    expect(isActivityPubArticleRequest(request(`${articlePath}?foo=bar`, 'application/activity+json'))).toBe(true);
  });

  it('rejects a trailing slash because Fedify does not route it', () => {
    expect(isActivityPubArticleRequest(request(`${articlePath}/`, 'application/activity+json'))).toBe(false);
  });

  it('rejects other paths', () => {
    expect(isActivityPubArticleRequest(request('/users/kosui', 'application/activity+json'))).toBe(false);
    expect(isActivityPubArticleRequest(request(`/users/kosui/posts/${articleId}`, 'application/activity+json'))).toBe(
      false,
    );
    expect(isActivityPubArticleRequest(request('/users/kosui/articles', 'application/activity+json'))).toBe(false);
    expect(isActivityPubArticleRequest(request(`/users/kosui/articles/${articleId}/edit`, 'application/activity+json')))
      .toBe(false);
    expect(isActivityPubArticleRequest(request(`/articles/${articleId}`, 'application/activity+json'))).toBe(false);
  });
});
