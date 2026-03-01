import fs from 'node:fs';
import path from 'node:path';

type Post = {
  title: string;
  basename: string;
  status: string;
  date: string;
  image?: string;
  body: string;
};

const parseExport = (content: string): Post[] => {
  const entries = content.split('--------\n').filter((e) => e.trim());
  const posts: Post[] = [];

  for (const entry of entries) {
    const bodyMatch = entry.match(/-----\nBODY:\n([\s\S]*?)(?:\n-----\n|-----\n--------|\n-----$)/);
    if (!bodyMatch) continue;

    const headerPart = entry.slice(0, entry.indexOf('-----\nBODY:'));
    const body = bodyMatch[1].trim();

    const getField = (name: string): string | undefined => {
      const match = headerPart.match(new RegExp(`^${name}: (.+)$`, 'm'));
      return match?.[1]?.trim();
    };

    const status = getField('STATUS');
    if (status !== 'Publish') continue;

    const title = getField('TITLE') ?? '';
    const basename = getField('BASENAME') ?? '';
    const dateStr = getField('DATE') ?? '';
    const image = getField('IMAGE');

    // Parse date: "12/10/2025 21:04:15" -> ISO format
    const dateMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
    let isoDate = dateStr;
    if (dateMatch) {
      const [, month, day, year, hour, min, sec] = dateMatch;
      isoDate = `${year}-${month}-${day}T${hour}:${min}:${sec}+09:00`;
    }

    posts.push({ title, basename, status: status!, date: isoDate, image, body });
  }

  return posts;
};

const stripHatenaSyntaxHighlighting = (html: string): string => {
  // Remove span tags from syntax-highlighted code blocks
  return html.replace(/<span[^>]*class="syn[^"]*"[^>]*>([\s\S]*?)<\/span>/g, '$1');
};

const convertHtmlToMarkdown = (html: string): string => {
  let md = html;

  // Pre-process: convert code blocks first (before other transformations)
  md = md.replace(
    /<pre class="code lang-(\w+)"[^>]*>([\s\S]*?)<\/pre>/g,
    (_match, lang: string, code: string) => {
      const cleanCode = stripHatenaSyntaxHighlighting(code)
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .replace(/&nbsp;/g, ' ');
      return `\n\`\`\`${lang}\n${cleanCode.trim()}\n\`\`\`\n`;
    },
  );

  // Pre blocks without language
  md = md.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/g,
    (_match, code: string) => {
      const cleanCode = stripHatenaSyntaxHighlighting(code)
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .replace(/&nbsp;/g, ' ');
      return `\n\`\`\`\n${cleanCode.trim()}\n\`\`\`\n`;
    },
  );

  // Headings
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/g, '\n##### $1\n');

  // Hatena keyword links -> plain text
  md = md.replace(/<a class="keyword"[^>]*>([\s\S]*?)<\/a>/g, '$1');

  // Regular links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)');

  // Images (hatena fotolife and regular)
  md = md.replace(
    /<span[^>]*itemtype="http:\/\/schema\.org\/Photograph"[^>]*><img[^>]*src="([^"]*)"[^>]*><\/span>/g,
    '![]($1)',
  );
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/g, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/g, '![]($1)');

  // Blockquote
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (_match, content: string) => {
    const lines = content.replace(/<\/?p[^>]*>/g, '\n').trim().split('\n');
    return lines.map((line: string) => `> ${line.trim()}`).filter((line: string) => line !== '> ').join('\n') + '\n';
  });

  // Bold / strong
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**');
  md = md.replace(/<b>([\s\S]*?)<\/b>/g, '**$1**');

  // Italic / em
  md = md.replace(/<em>([\s\S]*?)<\/em>/g, '*$1*');

  // Inline code
  md = md.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`');

  // Handle nested lists by running multiple passes
  const convertLists = (text: string): string => {
    let result = text;
    // Run multiple passes to handle nesting
    for (let i = 0; i < 5; i++) {
      const prev = result;
      result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_match, content: string) => {
        return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, li: string) => `- ${li.trim()}\n`)
          + '\n';
      });
      result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_match, content: string) => {
        let idx = 1;
        return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, li: string) =>
          `${idx++}. ${li.trim()}\n`)
          + '\n';
      });
      if (result === prev) break;
    }
    return result;
  };
  md = convertLists(md);

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_match, tableContent: string) => {
    const rows: string[][] = [];
    const rowMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) ?? [];
    for (const row of rowMatches) {
      const cells = (row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g) ?? []).map(
        (cell) => cell.replace(/<\/?t[hd][^>]*>/g, '').trim(),
      );
      rows.push(cells);
    }
    if (rows.length === 0) return '';
    const header = `| ${rows[0].join(' | ')} |`;
    const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
    const body = rows.slice(1).map((r) => `| ${r.join(' | ')} |`).join('\n');
    return `\n${header}\n${separator}\n${body}\n`;
  });

  // iframes - keep as JSX (for embed cards etc.)
  // Convert hatena blog embed iframes to links
  md = md.replace(
    /<iframe[^>]*src="https:\/\/hatenablog-parts\.com\/embed\?url=([^"]*)"[^>]*><\/iframe>/g,
    (_match, encodedUrl: string) => {
      const url = decodeURIComponent(encodedUrl);
      return `[${url}](${url})`;
    },
  );

  // Other iframes - convert to links where possible
  md = md.replace(/<iframe[^>]*src="([^"]*)"[^>]*><\/iframe>/g, '[$1]($1)');

  // Remove cite elements
  md = md.replace(/<cite[^>]*>[\s\S]*?<\/cite>/g, '');

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '\n$1\n');

  // Line breaks
  md = md.replace(/<br\s*\/?>/g, '\n');

  // Remove ALL remaining HTML tags (cleanup) - MDX treats them as JSX and fails
  md = md.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // HTML entities
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, '\'');
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)));

  // Escape { } and < > in non-code contexts for MDX compatibility
  // Process line by line, skipping fenced code blocks
  const lines = md.split('\n');
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Escape characters outside of inline code spans (backticks)
    // Split by backtick-delimited segments, only escape non-code parts
    const parts = lines[i].split(/(`[^`]*`)/g);
    for (let j = 0; j < parts.length; j++) {
      // Even indices are outside backticks, odd indices are inside
      if (j % 2 === 0) {
        parts[j] = parts[j].replace(/\{/g, '\\{').replace(/\}/g, '\\}');
        parts[j] = parts[j].replace(/<([A-Z])/g, '\\<$1');
      }
    }
    lines[i] = parts.join('');
  }
  md = lines.join('\n');

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
};

const slugify = (basename: string): string => {
  // "2025/12/10/210415" -> "2025-12-10-210415"
  // "2022/02/big-query-user-script/" -> "2022-02-big-query-user-script"
  return basename.replace(/\/$/, '').replace(/\//g, '-');
};

const main = (): void => {
  const exportPath = path.join(process.cwd(), 'kosui.me.export.txt');
  const outputDir = path.join(process.cwd(), 'src', 'content', 'posts');

  if (!fs.existsSync(exportPath)) {
    console.error(`Export file not found: ${exportPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(exportPath, 'utf-8');
  const posts = parseExport(content);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Found ${posts.length} published posts`);

  for (const post of posts) {
    const slug = slugify(post.basename);
    const markdown = convertHtmlToMarkdown(post.body);

    const frontmatter = [
      '---',
      `title: "${post.title.replace(/"/g, '\\"')}"`,
      `date: "${post.date}"`,
      `slug: "posts/${post.basename.replace(/\/$/, '')}"`,
      ...(post.image ? [`image: "${post.image}"`] : []),
      '---',
    ].join('\n');

    const mdxContent = `${frontmatter}\n\n${markdown}\n`;
    const fileName = `${slug}.mdx`;
    const filePath = path.join(outputDir, fileName);

    fs.writeFileSync(filePath, mdxContent, 'utf-8');
    console.log(`  Created: ${fileName}`);
  }

  console.log('Done!');
};

main();
