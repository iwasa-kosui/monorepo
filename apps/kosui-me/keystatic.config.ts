import { collection, config, fields, singleton } from '@keystatic/core';
import './src/styles/keystatic.css';

const postSchema = {
  title: fields.slug({ name: { label: 'Title' } }),
  date: fields.text({ label: 'Date' }),
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
  ogIcon: fields.text({ label: 'OG Icon' }),
  ogSvg: fields.text({ label: 'OG SVG' }),
  private: fields.checkbox({ label: 'Private' }),
  content: fields.mdx({ label: 'Content' }),
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
