import type { ComponentPropsWithoutRef } from 'react';

export const mdxComponents = {
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2
      className='text-2xl font-bold mt-12 mb-4 pb-2 border-b border-warm-gray dark:border-gray-700 text-charcoal dark:text-gray-100'
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className='text-xl font-bold mt-8 mb-3 text-charcoal dark:text-gray-100' {...props} />
  ),
  h4: (props: ComponentPropsWithoutRef<'h4'>) => (
    <h4 className='text-lg font-semibold mt-6 mb-2 text-charcoal dark:text-gray-100' {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className='my-4 leading-relaxed text-charcoal dark:text-gray-300' {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<'a'>) => (
    <a
      className='text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta underline'
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className='my-4 pl-6 list-disc text-charcoal dark:text-gray-300' {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className='my-4 pl-6 list-decimal text-charcoal dark:text-gray-300' {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => <li className='my-1 leading-relaxed' {...props} />,
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className='my-4 pl-4 border-l-4 border-warm-gray-dark dark:border-gray-600 text-charcoal-light dark:text-gray-400 italic'
      {...props}
    />
  ),
  img: (props: ComponentPropsWithoutRef<'img'>) => (
    <img className='my-4 rounded-[var(--radius-clay)] max-w-full' loading='lazy' {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className='my-4 overflow-x-auto'>
      <table className='w-full border-collapse' {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th
      className='border border-warm-gray-dark dark:border-gray-600 px-3 py-2 text-left bg-cream dark:bg-gray-800 font-semibold text-charcoal dark:text-gray-100'
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td
      className='border border-warm-gray-dark dark:border-gray-600 px-3 py-2 text-left text-charcoal dark:text-gray-300'
      {...props}
    />
  ),
  code: (props: ComponentPropsWithoutRef<'code'>) => {
    const isInline = typeof props.children === 'string';
    if (isInline) {
      return (
        <code
          className='bg-sand-light dark:bg-gray-800 rounded px-1.5 py-0.5 text-sm font-mono text-charcoal dark:text-gray-300'
          {...props}
        />
      );
    }
    return <code {...props} />;
  },
  hr: (props: ComponentPropsWithoutRef<'hr'>) => (
    <hr className='my-8 border-warm-gray dark:border-gray-700' {...props} />
  ),
};
