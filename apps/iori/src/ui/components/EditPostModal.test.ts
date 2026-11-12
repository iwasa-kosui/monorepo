import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyCrosspost, Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { EDIT_UNCHANGEABLE_NOTICE, EditPostModal } from './EditPostModal.tsx';

const target = postToStatus({
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
  content: '<p>編集前の本文</p>',
  createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
  logoUri: undefined,
  liked: false,
  reposted: false,
  inReplyToUri: null,
  summary: null,
  sensitive: false,
  images: [],
  likeCount: 0,
  repostCount: 0,
  reactions: [],
  linkPreviews: [],
  type: 'local',
} as unknown as PostWithAuthor);

const withCrosspost = (crosspost: IoriBlueskyCrosspost): Status => ({
  ...target,
  iori: { ...target.iori!, bluesky_crosspost: crosspost },
});

const withImage: Status = {
  ...target,
  media_attachments: [{ id: 'media-1', type: 'image' }] as unknown as Status['media_attachments'],
};

const render = (props: Partial<Parameters<typeof EditPostModal>[0]> = {}): string =>
  String(jsx(EditPostModal, {
    target,
    loadState: 'loaded',
    content: '直す本文',
    cw: '',
    sensitive: false,
    isSending: false,
    errorText: undefined,
    onClose: () => {},
    onSubmit: () => {},
    onContentChange: () => {},
    onCwChange: () => {},
    onSensitiveChange: () => {},
    ...props,
  }));

const sent: IoriBlueskyCrosspost = { status: 'sent', skip_reason: null, retrying: false, url: null };

describe('EditPostModal', () => {
  it('見出しを「投稿を編集」、ボタンを「保存」にする', () => {
    const html = render();

    expect(html).toMatch(/<h2[^>]*>投稿を編集<\/h2>/);
    expect(html).toMatch(/>保存<\/button>/);
  });

  it('本文と CW の初期値を入れる', () => {
    const html = render({ content: '直す本文', cw: '注意書き' });

    expect(html).toContain('直す本文');
    expect(html).toContain('value="注意書き"');
  });

  it('画像・引用先・公開範囲・送り先は変えられないと伝え、その入力は出さない', () => {
    const html = render();

    expect(html).toContain('画像・引用先・公開範囲・送り先は変えられません');
    expect(EDIT_UNCHANGEABLE_NOTICE).toBe('画像・引用先・公開範囲・送り先は変えられません');
    expect(html).not.toContain('name="visibility"');
    expect(html).not.toContain('name="quote-destination"');
  });

  it('読み込み中は「読み込み中...」を出し、本文の入力と保存を出さない', () => {
    const html = render({ loadState: 'loading' });

    expect(html).toMatch(/<p role="status"[^>]*>読み込み中\.\.\.<\/p>/);
    expect(html).not.toContain('注意書き（CW）');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>保存<\/button>/);
  });

  it('読み込みに失敗したときは、エラー文を alert として出し、入力を出さず、保存を押せない', () => {
    const html = render({ loadState: 'failed', errorText: '編集する内容を読み込めませんでした' });

    expect(html).toMatch(/<p role="alert"[^>]*>編集する内容を読み込めませんでした<\/p>/);
    expect(html).not.toContain('注意書き（CW）');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>保存<\/button>/);
  });

  it('送信に失敗したときのエラー文を alert として出す', () => {
    expect(render({ errorText: '編集できませんでした' })).toMatch(/<p role="alert"[^>]*>編集できませんでした<\/p>/);
  });

  it('エラーが無いときは alert を出さない', () => {
    expect(render()).not.toContain('role="alert"');
  });

  it('本文が空で画像も無いときは保存を押せない', () => {
    expect(render({ content: '' })).toMatch(/<button[^>]*disabled[^>]*>保存<\/button>/);
    expect(render({ content: '直す' })).not.toMatch(/<button[^>]*disabled[^>]*>保存<\/button>/);
  });

  it('画像がある投稿では、本文が空でも保存を押せる', () => {
    expect(render({ target: withImage, content: '' })).not.toMatch(/<button[^>]*disabled[^>]*>保存<\/button>/);
  });

  it('画像がある投稿にだけ、センシティブのチェックを出す', () => {
    expect(render()).not.toContain('画像をセンシティブにする');
    expect(render({ target: withImage, sensitive: true })).toMatch(
      /<input[^>]*checked[^>]*>[^<]*画像をセンシティブにする/,
    );
  });

  it('CW があるときは、センシティブのチェックを付けて変えられなくする', () => {
    const html = render({ target: withImage, cw: '注意', sensitive: false });

    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*checked)(?=[^>]*disabled)[^>]*type="checkbox"[^>]*>/);
  });

  describe('Bluesky の注意', () => {
    const notice = 'Bluesky に送った投稿は変わらず、編集前の内容のまま残ります';

    it('Bluesky に送った投稿では出す', () => {
      expect(render({ target: withCrosspost(sent) })).toContain(notice);
    });

    it('Bluesky に送っていない投稿では出さない', () => {
      expect(render()).not.toContain('Bluesky');
      expect(render({ target: withCrosspost({ ...sent, status: 'skipped', skip_reason: 'visibility' }) }))
        .not.toContain('Bluesky');
      expect(render({ target: withCrosspost({ ...sent, status: 'failed', retrying: false }) }))
        .not.toContain('Bluesky');
    });
  });
});
