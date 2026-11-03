import { describe, expect, it } from 'vitest';

import { Instant } from '../../instant/instant.ts';
import { UserId } from '../../user/userId.ts';
import { MediaId } from '../mediaId.ts';
import { MEDIA_DESCRIPTION_MAX_LENGTH, MediaUpload } from '../mediaUpload.ts';

const now = Instant.now();
const input = (description: string | null | undefined) => ({
  mediaId: MediaId.generate(),
  userId: UserId.generate(),
  url: 'https://iori.test/uploads/x.png',
  mimeType: 'image/png' as const,
  description,
});

describe('MediaUpload', () => {
  it('作成イベントに説明つきの状態を入れる', () => {
    const result = MediaUpload.create(input('猫'), now);

    expect(result).toMatchObject({
      ok: true,
      val: { eventName: 'mediaUpload.created', aggregateState: { description: '猫', createdAt: now } },
    });
  });

  it('空の説明と省略は null にそろえる', () => {
    for (const description of ['', undefined, null]) {
      const result = MediaUpload.create(input(description), now);

      expect(result.ok && result.val.aggregateState.description).toBeNull();
    }
  });

  it('説明は 1500 文字まで受け付け、超えたら InvalidMediaDescriptionError にする', () => {
    expect(MediaUpload.create(input('あ'.repeat(MEDIA_DESCRIPTION_MAX_LENGTH)), now).ok).toBe(true);
    expect(MediaUpload.create(input('あ'.repeat(MEDIA_DESCRIPTION_MAX_LENGTH + 1)), now)).toMatchObject({
      ok: false,
      err: { type: 'InvalidMediaDescriptionError' },
    });
  });

  it('絵文字は 1 文字として数える', () => {
    expect(MediaUpload.create(input('😀'.repeat(MEDIA_DESCRIPTION_MAX_LENGTH)), now).ok).toBe(true);
  });

  it('説明の更新イベントに新しい説明を入れる', () => {
    const created = MediaUpload.create(input('猫'), now);
    if (!created.ok) throw new Error('unexpected');

    const updated = MediaUpload.updateDescription(created.val.aggregateState, '犬', now);

    expect(updated).toMatchObject({
      ok: true,
      val: {
        eventName: 'mediaUpload.descriptionUpdated',
        eventPayload: { mediaId: created.val.aggregateState.mediaId, description: '犬' },
        aggregateState: { description: '犬' },
      },
    });
  });
});
