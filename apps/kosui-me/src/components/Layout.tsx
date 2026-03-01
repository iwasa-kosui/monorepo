import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div className='min-h-screen flex flex-col'>
      <header className='border-b border-warm-gray dark:border-charcoal'>
        <nav className='max-w-3xl mx-auto px-4 py-4 flex items-center justify-between'>
          <Link
            to='/'
            className='text-xl font-bold text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-warm-white transition-colors'
          >
            kosui
          </Link>
          <div className='flex gap-6 text-sm'>
            <Link
              to='/'
              className='text-charcoal-light hover:text-charcoal dark:text-warm-gray dark:hover:text-warm-white transition-colors'
            >
              Posts
            </Link>
            <Link
              to='/talks'
              className='text-charcoal-light hover:text-charcoal dark:text-warm-gray dark:hover:text-warm-white transition-colors'
            >
              Talks
            </Link>
            <Link
              to='/about'
              className='text-charcoal-light hover:text-charcoal dark:text-warm-gray dark:hover:text-warm-white transition-colors'
            >
              About
            </Link>
            <a
              href='/feed.xml'
              className='text-charcoal-light hover:text-charcoal dark:text-warm-gray dark:hover:text-warm-white transition-colors'
            >
              RSS
            </a>
          </div>
        </nav>
      </header>
      <main className='flex-1 max-w-3xl mx-auto px-4 py-8 w-full'>
        {children}
      </main>
      <footer className='border-t border-warm-gray dark:border-charcoal'>
        <div className='max-w-3xl mx-auto px-4 py-6 text-center text-sm text-charcoal-light dark:text-warm-gray'>
          &copy; {new Date().getFullYear()} kosui
        </div>
      </footer>
    </div>
  );
};
