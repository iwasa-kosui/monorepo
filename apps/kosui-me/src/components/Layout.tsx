import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const BackgroundDecoration = () => (
  <div className='bg-decoration' aria-hidden='true'>
    <div className='bg-blob bg-blob-1' />
    <div className='bg-blob bg-blob-2' />
    <div className='bg-blob bg-blob-3' />
  </div>
);

export const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div className='min-h-screen flex flex-col'>
      <BackgroundDecoration />
      <header className='relative z-10'>
        <nav className='max-w-2xl mx-auto px-4 py-4 flex items-center justify-between'>
          <Link to='/' className='flex items-center gap-2 group'>
            <img
              src='https://github.com/iwasa-kosui.png'
              alt='kosui'
              className='w-8 h-8 blob-avatar object-cover'
            />
            <span className='text-xl font-bold text-terracotta group-hover:text-terracotta-dark transition-colors'>
              kosui
            </span>
          </Link>
          <div className='flex gap-6 text-sm'>
            <Link
              to='/'
              className='text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light transition-colors'
            >
              記事一覧
            </Link>
            <Link
              to='/about'
              className='text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light transition-colors'
            >
              私について
            </Link>
            <a
              href='/feed.xml'
              className='text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light transition-colors'
            >
              RSS
            </a>
          </div>
        </nav>
      </header>
      <main className='flex-1 max-w-2xl mx-auto px-4 py-8 w-full relative z-10'>{children}</main>
      <footer className='relative z-10'>
        <div className='max-w-2xl mx-auto px-4 py-6 text-center text-sm text-charcoal-light dark:text-gray-500'>
          &copy; {new Date().getFullYear()} kosui
        </div>
      </footer>
    </div>
  );
};
