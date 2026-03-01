import { Link } from 'react-router-dom';

import { Layout } from '../components/Layout.tsx';
import { getPosts } from '../content/posts/index.ts';

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const PostListPage = () => {
  const posts = getPosts();

  return (
    <Layout>
      <h1 className='text-3xl font-bold mb-8 text-charcoal dark:text-gray-100'>記事一覧</h1>
      <ul className='space-y-4'>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              to={`/${post.slug}`}
              className='block bg-cream dark:bg-gray-800 rounded-[var(--radius-clay)] shadow-clay dark:shadow-clay-dark clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg group'
            >
              <div className={`relative z-10 ${post.image ? 'flex items-start gap-4' : ''} p-4 sm:p-5`}>
                {post.image && (
                  <img
                    src={post.image}
                    alt=''
                    className='w-36 h-28 object-cover rounded-[12px] flex-shrink-0'
                    loading='lazy'
                  />
                )}
                <div className='flex-1 min-w-0'>
                  <time className='text-xs text-terracotta dark:text-terracotta-light' dateTime={post.date}>
                    {formatDate(post.date)}
                  </time>
                  <h2 className='text-base font-semibold text-charcoal dark:text-gray-100 group-hover:text-terracotta dark:group-hover:text-terracotta-light transition-colors mt-1 line-clamp-2'>
                    {post.title}
                  </h2>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  );
};
