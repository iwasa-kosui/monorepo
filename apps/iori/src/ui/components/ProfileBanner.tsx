type Props = Readonly<{ url: string }>;

/**
 * ユーザー詳細のカード上部に、カードの幅いっぱいで出すバナー。
 * 親のカードが p-6 と rounded-clay であることを前提に、余白を打ち消して上の角だけ丸める。
 */
export const ProfileBanner = ({ url }: Props) => (
  <a
    href={url}
    target='_blank'
    rel='noopener noreferrer'
    class='block -mx-6 -mt-6 mb-4 relative z-10'
  >
    <img src={url} alt='ヘッダー画像' class='w-full h-48 sm:h-64 object-cover rounded-t-clay' />
  </a>
);
