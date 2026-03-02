import { Layout } from '../components/Layout.tsx';
import { getTalks } from '../content/talks/index.ts';

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const TalkListPage = () => {
  const talks = getTalks();

  return (
    <Layout>
      <h1 className='text-3xl font-bold mb-8'>Talks</h1>
      <ul className='space-y-4'>
        {talks.map((talk) => (
          <li key={`${talk.year}/${talk.name}`}>
            <a
              href={`https://talks.kosui.me/${talk.year}/${talk.name}/`}
              target='_blank'
              rel='noopener noreferrer'
              className='block bg-cream dark:bg-[#2d2a28] rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'
            >
              <time className='text-xs text-terracotta dark:text-terracotta-light' dateTime={talk.date}>
                {formatDate(talk.date)}
              </time>
              {talk.event && <p className='text-sm font-medium text-teal dark:text-teal mt-1'>@ {talk.event}</p>}
              <h2 className='text-lg font-semibold text-charcoal dark:text-gray-100 mt-1'>{talk.title}</h2>
              {talk.description && (
                <p className='mt-1 text-sm text-charcoal-light dark:text-warm-gray'>{talk.description}</p>
              )}
              {talk.tags.length > 0 && (
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {talk.tags.map((tag) => (
                    <span
                      key={tag}
                      className='inline-block px-2 py-0.5 text-xs rounded-full bg-sand-light dark:bg-[#3d3835] text-charcoal-light dark:text-warm-gray'
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Layout>
  );
};
