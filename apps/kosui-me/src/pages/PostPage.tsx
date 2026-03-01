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
        <div className='bg-cream dark:bg-gray-800 rounded-[var(--radius-clay)] shadow-clay dark:shadow-clay-dark blob-bg p-6 sm:p-8'>
          <div className='relative z-10'>
            <h1 className='text-3xl font-bold text-charcoal dark:text-gray-100'>404 - Not Found</h1>
            <p className='mt-4 text-charcoal-light dark:text-gray-400'>The requested post was not found.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const { meta, Component } = post;

  return (
    <Layout>
      <article className='bg-cream dark:bg-gray-800 rounded-[var(--radius-clay)] shadow-clay dark:shadow-clay-dark blob-bg p-6 sm:p-8'>
        <div className='relative z-10'>
          <header className='mb-8'>
            <time className='text-sm text-terracotta dark:text-terracotta-light' dateTime={meta.date}>
              {formatDate(meta.date)}
            </time>
            <h1 className='text-3xl font-bold mt-2 text-charcoal dark:text-gray-100'>{meta.title}</h1>
          </header>
          <div className='prose'>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Component components={mdxComponents as any} />
          </div>
        </div>
      </article>
    </Layout>
  );
};
