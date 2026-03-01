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
              className='block group'
            >
              <div className='flex items-center gap-2 text-sm'>
                <time className='text-terracotta dark:text-terracotta-light' dateTime={talk.date}>
                  {formatDate(talk.date)}
                </time>
                {talk.event && (
                  <span className='text-charcoal-light dark:text-warm-gray'>
                    — {talk.event}
                  </span>
                )}
              </div>
              <h2 className='text-lg font-medium group-hover:text-terracotta dark:group-hover:text-terracotta-light transition-colors'>
                {talk.title}
              </h2>
              {talk.tags.length > 0 && (
                <div className='flex flex-wrap gap-1.5 mt-1'>
                  {talk.tags.map((tag) => (
                    <span
                      key={tag}
                      className='text-xs px-1.5 py-0.5 rounded bg-warm-gray/30 text-charcoal-light dark:bg-charcoal/50 dark:text-warm-gray'
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
