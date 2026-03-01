import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div className='min-h-screen flex flex-col'>
      <header className='border-b border-gray-200'>
        <nav className='max-w-3xl mx-auto px-4 py-4 flex items-center justify-between'>
          <Link to='/' className='text-xl font-bold text-gray-900 hover:text-gray-600 transition-colors'>
            kosui
          </Link>
          <div className='flex gap-6 text-sm'>
            <Link to='/' className='text-gray-600 hover:text-gray-900 transition-colors'>
              Posts
            </Link>
            <Link to='/about' className='text-gray-600 hover:text-gray-900 transition-colors'>
              About
            </Link>
            <a href='/feed.xml' className='text-gray-600 hover:text-gray-900 transition-colors'>
              RSS
            </a>
          </div>
        </nav>
      </header>
      <main className='flex-1 max-w-3xl mx-auto px-4 py-8 w-full'>
        {children}
      </main>
      <footer className='border-t border-gray-200'>
        <div className='max-w-3xl mx-auto px-4 py-6 text-center text-sm text-gray-500'>
          &copy; {new Date().getFullYear()} kosui
        </div>
      </footer>
    </div>
  );
};
