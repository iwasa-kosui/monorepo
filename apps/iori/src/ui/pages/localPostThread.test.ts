import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { StatusContext } from '../api/mastodonClient.ts';
import { resolveLocalPostThread } from './localPostThread.ts';

const post = (id: string) => ({ id }) as unknown as Status;

const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

const fulfilled = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
const rejected = (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason });

const context: StatusContext = { ancestors: [post('a1')], descendants: [post('d1'), post('d2')] };

describe('resolveLocalPostThread', () => {
  it('本体が 404 なら見つからないとする', () => {
    expect(resolveLocalPostThread(rejected(apiError(404, 'Record not found')), fulfilled(context))).toEqual({
      type: 'notFound',
    });
  });

  it('本体と context が両方 404 でも見つからないとする', () => {
    expect(resolveLocalPostThread(rejected(apiError(404, 'Record not found')), rejected(apiError(404, 'x')))).toEqual({
      type: 'notFound',
    });
  });

  it('本体が JSON の error を持つ API エラーで失敗したら、その message をエラーとする', () => {
    expect(resolveLocalPostThread(rejected(apiError(500, 'Internal error')), fulfilled(context))).toEqual({
      type: 'error',
      message: 'Internal error',
    });
  });

  it('本体がネットワークの TypeError で失敗したら、その message をエラーとする', () => {
    expect(resolveLocalPostThread(rejected(new TypeError('Failed to fetch')), fulfilled(context))).toEqual({
      type: 'error',
      message: 'Failed to fetch',
    });
  });

  it('本体も context も成功したら、投稿とスレッドを返す', () => {
    expect(resolveLocalPostThread(fulfilled(post('p')), fulfilled(context))).toEqual({
      type: 'loaded',
      currentPost: post('p'),
      ancestors: context.ancestors,
      descendants: context.descendants,
      contextFailed: false,
    });
  });

  it('本体が成功して context が失敗したら、投稿だけを返してスレッドの失敗を示す', () => {
    expect(resolveLocalPostThread(fulfilled(post('p')), rejected(apiError(500, 'Internal error')))).toEqual({
      type: 'loaded',
      currentPost: post('p'),
      ancestors: [],
      descendants: [],
      contextFailed: true,
    });
  });

  it('context が 404 でもスレッドの失敗として投稿を返す', () => {
    expect(resolveLocalPostThread(fulfilled(post('p')), rejected(apiError(404, 'Record not found')))).toEqual({
      type: 'loaded',
      currentPost: post('p'),
      ancestors: [],
      descendants: [],
      contextFailed: true,
    });
  });

  it('context がネットワークの TypeError で失敗してもスレッドの失敗として投稿を返す', () => {
    expect(resolveLocalPostThread(fulfilled(post('p')), rejected(new TypeError('Failed to fetch')))).toMatchObject({
      type: 'loaded',
      contextFailed: true,
    });
  });
});
