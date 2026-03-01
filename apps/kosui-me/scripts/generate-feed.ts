import fs from 'node:fs';
import path from 'node:path';
import { Feed } from 'feed';

type PostMeta = {
  title: string;
  date: string;
  slug: string;
  image?: string;
  description?: string;
};

const loadPosts = (): PostMeta[] => {
  const postsDir = path.join(process.cwd(), 'src', 'content', 'posts');
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith('.mdx'));

  const posts: PostMeta[] = files.flatMap((file) => {
    const content = fs.readFileSync(path.join(postsDir, file), 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return [];

    const fm = frontmatterMatch[1];
    const title = fm.match(/^title:\s*"(.+)"$/m)?.[1] ?? '';
    const date = fm.match(/^date:\s*"(.+)"$/m)?.[1] ?? '';
    const slug = fm.match(/^slug:\s*"(.+)"$/m)?.[1] ?? '';
    const image = fm.match(/^image:\s*"(.+)"$/m)?.[1];
    const description = fm.match(/^description:\s*"(.+)"$/m)?.[1];

    return [{ title, date, slug, image, description }];
  });

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const main = (): void => {
  const siteUrl = 'https://kosui.me';
  const posts = loadPosts();

  const feed = new Feed({
    title: 'kosui',
    description: 'kosuiの技術ブログ。TypeScript, Node.js, インフラなどの知見を発信しています。',
    id: siteUrl,
    link: siteUrl,
    language: 'ja',
    favicon: `${siteUrl}/favicon.ico`,
    copyright: `Copyright ${new Date().getFullYear()} kosui`,
    author: {
      name: 'kosui',
      link: 'https://x.com/kosui_me',
    },
  });

  for (const post of posts) {
    feed.addItem({
      title: post.title,
      id: `${siteUrl}/${post.slug}`,
      link: `${siteUrl}/${post.slug}`,
      date: new Date(post.date),
      ...(post.description ? { description: post.description } : {}),
      ...(post.image ? { image: post.image } : {}),
    });
  }

  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // RSS
  fs.writeFileSync(path.join(publicDir, 'feed.xml'), feed.rss2());
  console.log('Generated feed.xml');

  // Sitemap
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${siteUrl}/</loc></url>`,
    `  <url><loc>${siteUrl}/about</loc></url>`,
    ...posts.map((p) =>
      `  <url><loc>${siteUrl}/${p.slug}</loc><lastmod>${new Date(p.date).toISOString().split('T')[0]}</lastmod></url>`
    ),
    '</urlset>',
  ].join('\n');

  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);
  console.log('Generated sitemap.xml');
};

main();
