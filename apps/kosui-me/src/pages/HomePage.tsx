import { Link } from 'react-router-dom';

import { Layout } from '../components/Layout.tsx';
import { getTimeline, type TimelineItem } from '../content/timeline.ts';

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const KindLabel = ({ kind }: { kind: TimelineItem['kind'] }) => {
  const config = {
    post: {
      label: 'Post',
      className: 'bg-terracotta/10 text-terracotta dark:bg-terracotta/20 dark:text-terracotta-light',
    },
    talk: {
      label: 'Talk',
      className: 'bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal',
    },
    'external-article': {
      label: 'External',
      className: 'bg-steel-blue/10 text-steel-blue dark:bg-steel-blue/20 dark:text-steel-blue',
    },
  } as const;

  const { label, className } = config[kind];
  return <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${className}`}>{label}</span>;
};

const TagList = ({ tags }: { tags: string[] }) => {
  if (tags.length === 0) return null;
  return (
    <div className='mt-2 flex flex-wrap gap-1.5'>
      {tags.map((tag) => (
        <span
          key={tag}
          className='inline-block px-2 py-0.5 text-xs rounded-full bg-sand-light dark:bg-[#3d3835] text-charcoal-light dark:text-warm-gray'
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

const PostCard = ({ item }: { item: TimelineItem & { kind: 'post' } }) => (
  <Link
    to={`/${item.data.slug}`}
    className='block bg-cream dark:bg-[#2d2a28] rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'
  >
    <div className='flex items-center gap-2'>
      <time className='text-xs text-terracotta dark:text-terracotta-light' dateTime={item.date}>
        {formatDate(item.date)}
      </time>
      <KindLabel kind='post' />
    </div>
    <h2 className='text-lg font-semibold text-charcoal dark:text-gray-100 mt-1'>{item.data.title}</h2>
    {item.data.description && (
      <p className='mt-1 text-sm text-charcoal-light dark:text-warm-gray'>{item.data.description}</p>
    )}
    <TagList tags={item.data.tags ?? []} />
  </Link>
);

const TalkCard = ({ item }: { item: TimelineItem & { kind: 'talk' } }) => (
  <a
    href={`https://talks.kosui.me/${item.data.year}/${item.data.name}/`}
    target='_blank'
    rel='noopener noreferrer'
    className='block bg-cream dark:bg-[#2d2a28] rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'
  >
    <div className='flex items-center gap-2'>
      <time className='text-xs text-terracotta dark:text-terracotta-light' dateTime={item.date}>
        {formatDate(item.date)}
      </time>
      <KindLabel kind='talk' />
      {item.data.event && <span className='text-xs text-charcoal-light dark:text-warm-gray'>{item.data.event}</span>}
    </div>
    <h2 className='text-lg font-semibold text-charcoal dark:text-gray-100 mt-1'>{item.data.title}</h2>
    <TagList tags={item.data.tags} />
  </a>
);

const ExternalArticleCard = ({ item }: { item: TimelineItem & { kind: 'external-article' } }) => (
  <a
    href={item.data.url}
    target='_blank'
    rel='noopener noreferrer'
    className='block bg-cream dark:bg-[#2d2a28] rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'
  >
    <div className='flex items-center gap-2'>
      <time className='text-xs text-terracotta dark:text-terracotta-light' dateTime={item.date}>
        {formatDate(item.date)}
      </time>
      <KindLabel kind='external-article' />
      <span className='text-xs text-charcoal-light dark:text-warm-gray'>{item.data.publisher}</span>
    </div>
    <h2 className='text-lg font-semibold text-charcoal dark:text-gray-100 mt-1'>{item.data.title}</h2>
    {item.data.description && (
      <p className='mt-1 text-sm text-charcoal-light dark:text-warm-gray'>{item.data.description}</p>
    )}
    <TagList tags={item.data.tags} />
  </a>
);

const TimelineCard = ({ item }: { item: TimelineItem }) => {
  switch (item.kind) {
    case 'post':
      return <PostCard item={item} />;
    case 'talk':
      return <TalkCard item={item} />;
    case 'external-article':
      return <ExternalArticleCard item={item} />;
  }
};

export const HomePage = () => {
  const timeline = getTimeline();

  return (
    <Layout>
      <h1 className='text-3xl font-bold mb-8'>Timeline</h1>
      <ul className='space-y-4'>
        {timeline.map((item) => (
          <li key={`${item.kind}-${item.date}-${item.data.title}`}>
            <TimelineCard item={item} />
          </li>
        ))}
      </ul>
    </Layout>
  );
};
