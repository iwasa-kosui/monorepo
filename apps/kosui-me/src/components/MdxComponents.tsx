import type { ComponentPropsWithoutRef } from 'react';

import { extractText, isMermaid, MermaidDiagram } from './Mermaid.js';

export const mdxComponents = {
  pre: (props: ComponentPropsWithoutRef<'pre'>) => {
    const text = extractText(props.children);
    if (isMermaid(text)) {
      return <MermaidDiagram chart={text} />;
    }
    return <pre {...props} />;
  },
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className='text-2xl font-bold mt-12 mb-4 pb-2 border-b border-warm-gray dark:border-charcoal' {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 className='text-xl font-bold mt-8 mb-3' {...props} />,
  h4: (props: ComponentPropsWithoutRef<'h4'>) => <h4 className='text-lg font-semibold mt-6 mb-2' {...props} />,
  p: (props: ComponentPropsWithoutRef<'p'>) => <p className='my-4 leading-relaxed' {...props} />,
  a: (props: ComponentPropsWithoutRef<'a'>) => (
    <a
      className='text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-warm-white underline transition-colors'
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul className='my-4 pl-6 list-disc' {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol className='my-4 pl-6 list-decimal' {...props} />,
  li: (props: ComponentPropsWithoutRef<'li'>) => <li className='my-1 leading-relaxed' {...props} />,
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className='my-4 pl-4 border-l-4 border-warm-gray-dark text-charcoal-light italic dark:border-charcoal dark:text-warm-gray'
      {...props}
    />
  ),
  img: (props: ComponentPropsWithoutRef<'img'>) => (
    <img className='my-4 rounded-lg max-w-full' loading='lazy' {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className='my-4 overflow-x-auto'>
      <table className='w-full border-collapse' {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th
      className='border border-warm-gray px-3 py-2 text-left bg-cream font-semibold dark:border-charcoal dark:bg-charcoal'
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td className='border border-warm-gray px-3 py-2 text-left dark:border-charcoal' {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<'code'>) => {
    const isInline = typeof props.children === 'string';
    if (isInline) {
      return (
        <code
          className='bg-sand-light rounded px-1.5 py-0.5 text-sm font-mono text-charcoal dark:bg-charcoal dark:text-warm-gray'
          {...props}
        />
      );
    }
    return <code {...props} />;
  },
  hr: (props: ComponentPropsWithoutRef<'hr'>) => (
    <hr className='my-8 border-warm-gray dark:border-charcoal' {...props} />
  ),
};
