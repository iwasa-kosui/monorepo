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
      <h1 className='text-3xl font-bold mb-8'>Posts</h1>
      <ul className='space-y-4'>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              to={`/${post.slug}`}
              className='block bg-cream dark:bg-[#2d2a28] rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'
            >
              <time className='text-xs text-terracotta dark:text-terracotta-light' dateTime={post.date}>
                {formatDate(post.date)}
              </time>
              <h2 className='text-lg font-semibold text-charcoal dark:text-gray-100 mt-1'>
                {post.title}
              </h2>
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  );
};
