import { useLocation } from 'react-router-dom';

import { Layout } from '../components/Layout.tsx';
import { mdxComponents } from '../components/MdxComponents.tsx';
import { getPostBySlug } from '../content/posts/index.ts';

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const PostPage = () => {
  const location = useLocation();
  const slug = location.pathname.replace(/^\//, '');
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <Layout>
        <h1 className='text-3xl font-bold'>404 - Not Found</h1>
        <p className='mt-4 text-gray-600'>The requested post was not found.</p>
      </Layout>
    );
  }

  const { meta, Component } = post;

  return (
    <Layout>
      <article>
        <header className='mb-8'>
          <time className='text-sm text-gray-500' dateTime={meta.date}>
            {formatDate(meta.date)}
          </time>
          <h1 className='text-3xl font-bold mt-2'>{meta.title}</h1>
        </header>
        <div className='prose'>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Component components={mdxComponents as any} />
        </div>
      </article>
    </Layout>
  );
};
