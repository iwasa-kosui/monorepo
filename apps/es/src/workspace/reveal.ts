export type Span = Readonly<{ top: number; bottom: number }>;

// 枠の中に box を収めるための、スクロール量の差分を返す。box が枠より高いときは上端を合わせる
export const revealOffset = (frame: Span, box: Span): number => {
  const tall = box.bottom - box.top >= frame.bottom - frame.top;
  if (tall || box.top < frame.top) return box.top - frame.top;
  if (box.bottom > frame.bottom) return box.bottom - frame.bottom;
  return 0;
};
