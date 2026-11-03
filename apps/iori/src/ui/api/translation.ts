export const translationErrorMessage = (status: number | undefined): string => {
  switch (status) {
    case 429:
      return '今日の翻訳の回数を使い切りました';
    case 503:
      return '翻訳できませんでした。時間をおいてもう一度お試しください';
    default:
      return '翻訳できませんでした';
  }
};
