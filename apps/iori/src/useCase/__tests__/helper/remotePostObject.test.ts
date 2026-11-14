import { Article, Collection, Image, Link, Note, Person, Question } from '@fedify/vocab';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { sanitizePostContent } from '../../../domain/post/sanitizePostContent.ts';
import {
  buildRemotePostBody,
  buildRemotePostContent,
  isRemotePostObject,
  readRemotePostPoll,
} from '../../helper/remotePostObject.ts';

const ID = new URL('https://remote.example/objects/1');
const URL_OF_POST = new URL('https://remote.example/@alice/1');

describe('isRemotePostObject', () => {
  it('Note と Article と Question を取り込む対象にする', () => {
    expect(isRemotePostObject(new Note({ id: ID }))).toBe(true);
    expect(isRemotePostObject(new Article({ id: ID }))).toBe(true);
    expect(isRemotePostObject(new Question({ id: ID }))).toBe(true);
  });

  it('それ以外の値は取り込む対象にしない', () => {
    expect(isRemotePostObject(new Image({ id: ID }))).toBe(false);
    expect(isRemotePostObject(new Person({ id: ID }))).toBe(false);
    expect(isRemotePostObject(null)).toBe(false);
    expect(isRemotePostObject(undefined)).toBe(false);
    expect(isRemotePostObject({ content: 'x' })).toBe(false);
  });
});

describe('buildRemotePostContent', () => {
  describe('Article', () => {
    const readMore = (href: string) => `<p><a href="${href}">元の記事を読む</a></p>`;

    it('name、content、元の記事へのリンクをこの順に並べ、name はエスケープして太字の段落にする', async () => {
      const article = new Article({ id: ID, url: URL_OF_POST, name: 'A <b> & "c"', content: '<p>body</p>' });

      expect(await buildRemotePostContent(article)).toBe(
        `<p><strong>A &lt;b&gt; &amp; &quot;c&quot;</strong></p><p>body</p>${readMore(URL_OF_POST.href)}`,
      );
    });

    it('name が無ければ、content と元の記事へのリンクを返す', async () => {
      const article = new Article({ id: ID, url: URL_OF_POST, content: '<p>body</p>' });

      expect(await buildRemotePostContent(article)).toBe(`<p>body</p>${readMore(URL_OF_POST.href)}`);
    });

    it('content が空で summary があれば、summary を HTML のまま本文にする', async () => {
      const article = new Article({ id: ID, url: URL_OF_POST, name: 'Title', summary: '<p>excerpt</p>', content: ' ' });

      expect(await buildRemotePostContent(article)).toBe(
        `<p><strong>Title</strong></p><p>excerpt</p>${readMore(URL_OF_POST.href)}`,
      );
    });

    it('content があれば、summary は本文に入れない', async () => {
      const article = new Article({ id: ID, url: URL_OF_POST, summary: '<p>excerpt</p>', content: '<p>body</p>' });

      expect(await buildRemotePostContent(article)).toBe(`<p>body</p>${readMore(URL_OF_POST.href)}`);
    });

    it('content も summary も空なら、元の記事へのリンクだけを置く', async () => {
      const article = new Article({ id: ID, name: 'Title', url: URL_OF_POST });

      expect(await buildRemotePostContent(article)).toBe(
        `<p><strong>Title</strong></p>${readMore(URL_OF_POST.href)}`,
      );
    });

    it('url が Link なら、Link の href へのリンクを置く', async () => {
      const article = new Article({ id: ID, url: new Link({ href: URL_OF_POST }) });

      expect(await buildRemotePostContent(article)).toBe(readMore(URL_OF_POST.href));
    });

    it('url が無ければ、id へのリンクを置く', async () => {
      const article = new Article({ id: ID, content: '  ' });

      expect(await buildRemotePostContent(article)).toBe(readMore(ID.href));
    });

    it('リンクの href をエスケープする', async () => {
      const article = new Article({ id: new URL('https://remote.example/a?x=1&y="2"') });

      expect(await buildRemotePostContent(article)).toBe(
        '<p><a href="https://remote.example/a?x=1&amp;y=%222%22">元の記事を読む</a></p>',
      );
    });
  });

  describe('Question', () => {
    const question = (values: ConstructorParameters<typeof Question>[0]) =>
      new Question({ id: ID, url: URL_OF_POST, ...values });
    const vote = `<p><a href="${URL_OF_POST.href}">元の投稿で投票する</a></p>`;

    it('content と投票のリンクをこの順に並べ、選択肢のリストは置かない', async () => {
      const post = question({
        content: '<p>好きな色は?</p>',
        exclusiveOptions: [new Note({ name: '赤' }), new Note({ name: '青' })],
      });

      expect(await buildRemotePostContent(post)).toBe(`<p>好きな色は?</p>${vote}`);
    });

    it('content が空なら、name をエスケープして段落にする', async () => {
      const post = question({ name: 'x < y?', inclusiveOptions: [new Note({ name: 'yes' })] });

      expect(await buildRemotePostContent(post)).toBe(`<p>x &lt; y?</p>${vote}`);
    });

    it('選択肢が無ければ、投票のリンクだけを置く', async () => {
      expect(await buildRemotePostContent(question({ content: '<p>q</p>' }))).toBe(`<p>q</p>${vote}`);
    });

    it('投票を保存できるなら、投票のリンクを置かない', async () => {
      const post = question({ content: '<p>q</p>', exclusiveOptions: [new Note({ name: 'a' })] });
      const poll = await readRemotePostPoll(post);

      expect(poll).toBeDefined();
      expect(await buildRemotePostContent(post, poll)).toBe('<p>q</p>');
    });

    it('id だけの選択肢は、取りに行かず、選択肢なしで続ける', async () => {
      const post = question({
        content: '<p>q</p>',
        exclusiveOptions: [new URL('https://remote.example/options/1')],
      });

      expect(await buildRemotePostContent(post)).toBe(`<p>q</p>${vote}`);
    });
  });

  it('組み立てた HTML は sanitizer を通しても strong、a が残る', async () => {
    const article = await buildRemotePostContent(new Article({ id: ID, name: 'T', url: URL_OF_POST }));
    const poll = await buildRemotePostContent(
      new Question({ id: ID, url: URL_OF_POST, content: '<p>q</p>', exclusiveOptions: [new Note({ name: 'a' })] }),
    );

    expect(sanitizePostContent(article)).toBe(article);
    expect(sanitizePostContent(poll)).toBe(poll);
  });
});

describe('readRemotePostPoll', () => {
  const question = (values: ConstructorParameters<typeof Question>[0]) =>
    new Question({ id: ID, url: URL_OF_POST, ...values });
  const option = (name: string, totalItems?: number) =>
    new Note({
      name,
      replies: totalItems === undefined ? undefined : new Collection({ totalItems }),
    });

  it('exclusive の選択肢は multiple を false にし、replies の totalItems を票数にする', async () => {
    const poll = await readRemotePostPoll(
      question({ exclusiveOptions: [option('赤', 3), option('青', 5)] }),
    );

    expect(poll).toEqual({
      multiple: false,
      options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 5 }],
      votersCount: null,
      expiresAt: null,
      closed: false,
    });
  });

  it('inclusive の選択肢は multiple を true にする', async () => {
    const poll = await readRemotePostPoll(question({ inclusiveOptions: [option('a', 1), option('b', 2)] }));

    expect(poll?.multiple).toBe(true);
    expect(poll?.options).toEqual([{ title: 'a', votesCount: 1 }, { title: 'b', votesCount: 2 }]);
  });

  it('replies が無い選択肢の票数は 0 にする', async () => {
    const poll = await readRemotePostPoll(question({ exclusiveOptions: [option('a'), option('b', 4)] }));

    expect(poll?.options).toEqual([{ title: 'a', votesCount: 0 }, { title: 'b', votesCount: 4 }]);
  });

  it('replies が id だけなら、取りに行かず票数を 0 にする', async () => {
    const poll = await readRemotePostPoll(
      question({
        exclusiveOptions: [new Note({ name: 'a', replies: new URL('https://remote.example/options/a/replies') })],
      }),
    );

    expect(poll?.options).toEqual([{ title: 'a', votesCount: 0 }]);
  });

  it('votersCount が負の数、小数、文字列なら null にして、残りは使う', async () => {
    const received = (voters: unknown) =>
      Question.fromJsonLd({
        '@context': ['https://www.w3.org/ns/activitystreams', { toot: 'http://joinmastodon.org/ns#' }],
        type: 'Question',
        id: ID.href,
        oneOf: [{ type: 'Note', name: 'a', replies: { type: 'Collection', totalItems: 2 } }],
        'toot:votersCount': voters,
      });
    const negative = await readRemotePostPoll(await received(-1));
    const fractional = await readRemotePostPoll(await received(1.5));
    const text = await readRemotePostPoll(await received('7'));

    for (const poll of [negative, fractional, text]) {
      expect(poll?.votersCount).toBeNull();
      expect(poll?.options).toEqual([{ title: 'a', votesCount: 2 }]);
    }
  });

  it('選択肢は先頭から 50 個までにする', async () => {
    const options = Array.from({ length: 60 }, (_, index) => option(`o${index}`, index));

    const poll = await readRemotePostPoll(question({ exclusiveOptions: options }));

    expect(poll?.options).toHaveLength(50);
    expect(poll?.options[0]).toEqual({ title: 'o0', votesCount: 0 });
    expect(poll?.options[49]).toEqual({ title: 'o49', votesCount: 49 });
  });

  it('endTime が過去なら closed にする', async () => {
    const endTime = Temporal.Instant.from('2000-01-02T03:04:05Z');
    const poll = await readRemotePostPoll(question({ exclusiveOptions: [option('a')], endTime }));

    expect(poll?.expiresAt).toBe(endTime.epochMilliseconds);
    expect(poll?.closed).toBe(true);
  });

  it('closed があれば、endTime が未来でも closed にする', async () => {
    const endTime = Temporal.Instant.from('2999-01-02T03:04:05Z');
    const byInstant = await readRemotePostPoll(
      question({ exclusiveOptions: [option('a')], endTime, closed: Temporal.Instant.from('2026-01-01T00:00:00Z') }),
    );
    const byFlag = await readRemotePostPoll(question({ exclusiveOptions: [option('a')], endTime, closed: true }));

    expect(byInstant?.closed).toBe(true);
    expect(byFlag?.closed).toBe(true);
  });

  it('名前が空の選択肢は数えない', async () => {
    const poll = await readRemotePostPoll(question({ exclusiveOptions: [option('  ', 9), option('a', 1)] }));

    expect(poll?.options).toEqual([{ title: 'a', votesCount: 1 }]);
  });

  it('選択肢が id だけなら、取りに行かず投票を読まない', async () => {
    const poll = await readRemotePostPoll(
      question({ exclusiveOptions: [new URL('https://remote.example/options/1')] }),
    );

    expect(poll).toBeUndefined();
  });

  it('選択肢が無ければ、投票を読まない', async () => {
    expect(await readRemotePostPoll(question({ content: '<p>q</p>' }))).toBeUndefined();
  });
});

describe('buildRemotePostBody', () => {
  it('Question は本文と投票を一緒に返す', async () => {
    const body = await buildRemotePostBody(
      new Question({ id: ID, url: URL_OF_POST, content: '<p>q</p>', exclusiveOptions: [new Note({ name: 'a' })] }),
    );

    expect(body.content).toBe('<p>q</p>');
    expect(body.poll?.options).toEqual([{ title: 'a', votesCount: 0 }]);
  });

  it('投票を読めなかった Question は、投票のリンクを残して poll を返さない', async () => {
    const body = await buildRemotePostBody(new Question({ id: ID, url: URL_OF_POST, content: '<p>q</p>' }));

    expect(body).toEqual({ content: `<p>q</p><p><a href="${URL_OF_POST.href}">元の投稿で投票する</a></p>` });
  });
});
