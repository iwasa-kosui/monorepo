import type { FeedSourceKind } from './feedSource.ts';

export type DefaultFeedSource = Readonly<{ kind: FeedSourceKind; url: string; title: string }>;

export const defaultFeedSources: ReadonlyArray<DefaultFeedSource> = [
  {
    kind: 'hatena_hotentry',
    url: 'https://b.hatena.ne.jp/hotentry/it.rss',
    title: 'はてなブックマーク 人気エントリー テクノロジー',
  },
  {
    kind: 'hatena_entrylist',
    url: 'https://b.hatena.ne.jp/entrylist/it.rss',
    title: 'はてなブックマーク 新着エントリー テクノロジー',
  },
  { kind: 'rss', url: 'https://zenn.dev/feed', title: 'Zenn トレンド' },
  { kind: 'rss', url: 'https://qiita.com/popular-items/feed', title: 'Qiita 人気の記事' },
  { kind: 'rss', url: 'https://engineering.mercari.com/blog/feed.xml', title: 'メルカリ' },
  { kind: 'rss', url: 'https://techblog.lycorp.co.jp/ja/feed/index.xml', title: 'LINEヤフー' },
  { kind: 'rss', url: 'https://blog.cybozu.io/feed', title: 'サイボウズ' },
  { kind: 'rss', url: 'https://techlife.cookpad.com/feed', title: 'クックパッド' },
  { kind: 'rss', url: 'https://tech.smarthr.jp/feed', title: 'SmartHR' },
  { kind: 'rss', url: 'https://github.blog/feed/', title: 'GitHub Blog' },
  { kind: 'rss', url: 'https://blog.cloudflare.com/rss/', title: 'Cloudflare Blog' },
  { kind: 'rss', url: 'https://martinfowler.com/feed.atom', title: 'martinfowler.com' },
  { kind: 'rss', url: 'https://feed.infoq.com/', title: 'InfoQ' },
  { kind: 'rss', url: 'https://feed.infoq.com/architecture-design/', title: 'InfoQ Architecture & Design' },
  { kind: 'rss', url: 'https://aws.amazon.com/blogs/architecture/feed/', title: 'AWS Architecture Blog' },
  { kind: 'rss', url: 'https://leaddev.com/feed', title: 'LeadDev' },
  { kind: 'rss', url: 'https://newsletter.kentbeck.com/feed', title: 'Kent Beck' },
  { kind: 'rss', url: 'https://blog.pragmaticengineer.com/rss/', title: 'The Pragmatic Engineer' },
  { kind: 'rss', url: 'https://charity.wtf/feed/', title: 'Charity Majors' },
  { kind: 'rss', url: 'https://architectelevator.com/feed.xml', title: 'The Architect Elevator' },
  { kind: 'rss', url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', title: 'AWS What\'s New' },
  { kind: 'rss', url: 'https://aws.amazon.com/blogs/aws/feed/', title: 'AWS News Blog' },
  { kind: 'rss', url: 'https://aws.amazon.com/jp/blogs/news/feed/', title: 'AWS ブログ（日本語）' },
  { kind: 'rss', url: 'https://news.ycombinator.com/rss', title: 'Hacker News' },
  { kind: 'rss', url: 'https://github.blog/engineering/feed/', title: 'GitHub Engineering' },
  { kind: 'rss', url: 'https://netflixtechblog.com/feed', title: 'Netflix TechBlog' },
  { kind: 'rss', url: 'https://simonwillison.net/atom/everything/', title: 'Simon Willison' },
  {
    kind: 'thoughtworks_radar',
    url: 'https://www.thoughtworks.com/radar/archive',
    title: 'Thoughtworks Technology Radar',
  },
];
