import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { StatusContext } from '../api/mastodonClient.ts';
import {
  applyContext,
  resolveLocalPostThread,
  shouldReloadContext,
  showsRemoteContextLoading,
} from './localPostThread.ts';

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

  it('本体が Error でない値で失敗したら、その文字列を message とする', () => {
    expect(resolveLocalPostThread(rejected('plain failure'), fulfilled(context))).toEqual({
      type: 'error',
      message: 'plain failure',
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

describe('shouldReloadContext', () => {
  it('新しく取り込んだ投稿があるときだけ context を読み直す', () => {
    expect([0, 1, 40].map((fetched) => shouldReloadContext({ fetched }))).toEqual([false, true, true]);
  });
});

describe('applyContext', () => {
  const thread = { currentPost: post('p'), ancestors: [post('old-a')], descendants: [post('old-d')] };

  it('本体を残して祖先と子孫だけを新しい context に置き換える', () => {
    expect(applyContext(thread, context)).toEqual({
      currentPost: post('p'),
      ancestors: [post('a1')],
      descendants: [post('d1'), post('d2')],
    });
  });

  it('スレッドがまだないときは null のままにする', () => {
    expect(applyContext(null, context)).toBeNull();
  });
});

describe('showsRemoteContextLoading', () => {
  const statusOf = (acct: string, reblog: Status | null = null) =>
    ({ id: 'p', account: { acct }, reblog }) as unknown as Status;

  it('読み込み中で、表示中の投稿がリモートのときだけ表示する', () => {
    expect([
      showsRemoteContextLoading(true, statusOf('alice@remote.example')),
      showsRemoteContextLoading(true, statusOf('kosui')),
      showsRemoteContextLoading(false, statusOf('alice@remote.example')),
      showsRemoteContextLoading(true, null),
      showsRemoteContextLoading(true, statusOf('kosui', statusOf('alice@remote.example'))),
    ]).toEqual([true, false, false, false, true]);
  });
});
