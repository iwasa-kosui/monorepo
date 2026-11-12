import { Article, Image, Link, Note, Person, Question } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { sanitizePostContent } from '../../../domain/post/sanitizePostContent.ts';
import { buildRemotePostContent, isRemotePostObject } from '../../helper/remotePostObject.ts';

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
  describe('Note', () => {
    it('content をそのまま返す', async () => {
      expect(await buildRemotePostContent(new Note({ id: ID, content: '<p>hello</p>' }))).toBe('<p>hello</p>');
    });

    it('content が無いときは空文字を返す', async () => {
      expect(await buildRemotePostContent(new Note({ id: ID }))).toBe('');
    });
  });

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

    it('content、exclusive の選択肢、投票のリンクをこの順に並べる', async () => {
      const post = question({
        content: '<p>好きな色は?</p>',
        exclusiveOptions: [new Note({ name: '赤' }), new Note({ name: '青' })],
      });

      expect(await buildRemotePostContent(post)).toBe(
        `<p>好きな色は?</p><ul><li>赤</li><li>青</li></ul>${vote}`,
      );
    });

    it('inclusive の選択肢も並べる', async () => {
      const post = question({
        content: '<p>q</p>',
        exclusiveOptions: [new Note({ name: 'a' })],
        inclusiveOptions: [new Note({ name: 'b' }), new Note({ name: 'c' })],
      });

      expect(await buildRemotePostContent(post)).toBe(`<p>q</p><ul><li>a</li><li>b</li><li>c</li></ul>${vote}`);
    });

    it('content が空なら、name をエスケープして段落にする', async () => {
      const post = question({ name: 'x < y?', inclusiveOptions: [new Note({ name: 'yes' })] });

      expect(await buildRemotePostContent(post)).toBe(`<p>x &lt; y?</p><ul><li>yes</li></ul>${vote}`);
    });

    it('選択肢をエスケープする', async () => {
      const post = question({ content: '<p>q</p>', exclusiveOptions: [new Note({ name: '<script>&"\'' })] });

      expect(await buildRemotePostContent(post)).toBe(
        `<p>q</p><ul><li>&lt;script&gt;&amp;&quot;&#39;</li></ul>${vote}`,
      );
    });

    it('選択肢が無ければ、リストを置かない', async () => {
      expect(await buildRemotePostContent(question({ content: '<p>q</p>' }))).toBe(`<p>q</p>${vote}`);
    });

    it('url が無ければ、id へのリンクを置く', async () => {
      const post = new Question({ id: ID, content: '<p>q</p>' });

      expect(await buildRemotePostContent(post)).toBe(`<p>q</p><p><a href="${ID.href}">元の投稿で投票する</a></p>`);
    });

    it('id だけの選択肢は、取りに行かず、選択肢なしで続ける', async () => {
      const post = question({
        content: '<p>q</p>',
        exclusiveOptions: [new URL('https://remote.example/options/1')],
      });

      expect(await buildRemotePostContent(post)).toBe(`<p>q</p>${vote}`);
    });
  });

  it('組み立てた HTML は sanitizer を通しても strong、ul、li、a が残る', async () => {
    const article = await buildRemotePostContent(new Article({ id: ID, name: 'T', url: URL_OF_POST }));
    const poll = await buildRemotePostContent(
      new Question({ id: ID, content: '<p>q</p>', exclusiveOptions: [new Note({ name: 'a' })] }),
    );

    expect(sanitizePostContent(article)).toBe(article);
    expect(sanitizePostContent(poll)).toBe(poll);
  });
});
