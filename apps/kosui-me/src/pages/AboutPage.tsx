import { Layout } from '../components/Layout.tsx';

export const AboutPage = () => {
  return (
    <Layout>
      <h1 className='text-3xl font-bold mb-8'>About</h1>
      <div className='prose'>
        <p>
          kosui (<a href='https://x.com/kosui_me'>@kosui_me</a>) のブログです。
        </p>
        <p>
          TypeScript, Node.js, インフラなどサーバサイド開発に関する知見を発信しています。
        </p>
      </div>
    </Layout>
  );
};
