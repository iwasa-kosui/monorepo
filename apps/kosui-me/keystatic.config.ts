import { collection, config, fields } from '@keystatic/core';

const postSchema = {
  title: fields.slug({ name: { label: 'Title' } }),
  date: fields.text({ label: 'Date' }),
  slug: fields.text({ label: 'Slug' }),
  description: fields.text({ label: 'Description', multiline: true }),
  tags: fields.array(fields.text({ label: 'Tag' }), {
    label: 'Tags',
    itemLabel: (props) => props.value,
  }),
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
});
