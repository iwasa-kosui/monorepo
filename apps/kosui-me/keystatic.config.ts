import { collection, config, fields, singleton } from '@keystatic/core';
import { block } from '@keystatic/core/content-components';

import './src/styles/keystatic.css';

const contentComponents = {
  Figure: block({
    label: '図',
    schema: {
      name: fields.text({
        label: '図の名前',
        description: 'src/figures/ のファイル名（拡張子なし）',
      }),
    },
  }),
};

const postSchema = {
  title: fields.slug({ name: { label: 'Title' } }),
  ogTitle: fields.text({
    label: 'OG Title',
    description: 'OGP 画像の中に表示するタイトル。\\n で改行位置を指定する',
  }),
  date: fields.text({ label: 'Date' }),
  updatedDate: fields.text({
    label: 'Updated Date',
    description: '公開後に本文を直したときの日時（例: 2026-01-01T12:00:00+09:00）。直していなければ空にする',
  }),
  slug: fields.text({ label: 'Slug' }),
  description: fields.text({ label: 'Description', multiline: true }),
  themes: fields.array(
    fields.select({
      label: 'Theme',
      options: [
        { label: 'TypeScript', value: 'typescript' },
        { label: 'アーキテクチャ', value: 'architecture' },
        { label: 'SRE・運用', value: 'sre' },
        { label: 'チーム開発', value: 'team' },
      ],
      defaultValue: 'typescript',
    }),
    {
      label: 'Themes',
      itemLabel: (props) => props.value,
    },
  ),
  image: fields.text({ label: 'Image' }),
  private: fields.checkbox({ label: 'Private' }),
  content: fields.mdx({ label: 'Content', components: contentComponents }),
} as const;

export default config({
  storage: { kind: 'local' },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'src/content/posts/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: postSchema,
    }),
    reports: collection({
      label: 'Reports',
      slugField: 'title',
      path: 'src/content/reports/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: postSchema,
    }),
  },
  singletons: {
    resume: singleton({
      label: 'Resume',
      path: 'src/content/resume/resume',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title' }),
        description: fields.text({ label: 'Description', multiline: true }),
        content: fields.mdx({ label: 'Content' }),
      },
    }),
  },
});
