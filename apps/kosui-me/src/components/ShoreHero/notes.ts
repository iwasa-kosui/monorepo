/**
 * エビのそばに出す一言。
 */

/** このブラウザで攫われたエビの数を覚えておく場所 */
const LOST_COUNT_KEY = 'kosui:shore:lost';

type CountStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 攫われたエビを 1 匹数え、これまでの合計を返す。
 * 保存できない環境（プライベートウィンドウなど）では undefined を返す。
 */
export const recordLoss = (storage: CountStorage): number | undefined => {
  try {
    const previous = Number(storage.getItem(LOST_COUNT_KEY));
    const count = (Number.isInteger(previous) && previous > 0 ? previous : 0)
      + 1;
    storage.setItem(LOST_COUNT_KEY, String(count));
    return count;
  } catch {
    return undefined;
  }
};

/** エビを押したときの一言 */
export const PRESSED_NOTE = '跳ねても、波は待ってくれません。';

/** エビが海に消えたあとの一言 */
export const goneNote = (count: number | undefined): string =>
  [
    'エビは波に攫われました。',
    ...(count === undefined ? [] : [`このブラウザでは${count}匹目です。`]),
    '再読み込みすると、次のエビが打ち上げられます。',
  ].join('');
