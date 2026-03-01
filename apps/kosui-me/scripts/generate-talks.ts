import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

type TalkMetadata = {
  date?: string;
  event?: string;
  description?: string;
  tags?: string[];
  duration?: string;
};

type SlideType = 'local' | 'speakerdeck' | 'slideshare' | 'google-slides' | 'docswell';

type TalkEntry = {
  title: string;
  date: string;
  event: string;
  tags: string[];
  duration: string;
  description: string;
  year: string;
  name: string;
  slideType: SlideType;
};

type Frontmatter = {
  title?: string;
  talk?: TalkMetadata;
};

type MetadataYaml = {
  title?: string;
  talk?: TalkMetadata;
  external?: {
    type?: string;
    url?: string;
    embedUrl?: string;
  };
};

const VALID_EXTERNAL_TYPES = ['speakerdeck', 'slideshare', 'google-slides', 'docswell'] as const;

const parseFrontmatter = (content: string): Frontmatter | null => {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return null;

  try {
    return yaml.load(match[1]) as Frontmatter;
  } catch {
    return null;
  }
};

const main = (): void => {
  const talksRoot = path.resolve(process.cwd(), '..', '..', 'talks');

  if (!fs.existsSync(talksRoot)) {
    console.error(`talks directory not found: ${talksRoot}`);
    process.exit(1);
  }

  const entries: TalkEntry[] = [];
  const yearDirs = fs.readdirSync(talksRoot, { withFileTypes: true });

  for (const yearDir of yearDirs) {
    if (!yearDir.isDirectory() || !/^\d{4}$/.test(yearDir.name)) continue;

    const yearPath = path.join(talksRoot, yearDir.name);
    const talkDirs = fs.readdirSync(yearPath, { withFileTypes: true });

    for (const talkDir of talkDirs) {
      if (!talkDir.isDirectory()) continue;

      const talkPath = path.join(yearPath, talkDir.name);
      const slidesPath = path.join(talkPath, 'slides.md');
      const metadataPath = path.join(talkPath, 'metadata.yaml');

      if (fs.existsSync(slidesPath)) {
        const content = fs.readFileSync(slidesPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);
        if (!frontmatter?.talk?.date) continue;

        entries.push({
          title: frontmatter.title ?? talkDir.name,
          date: frontmatter.talk.date,
          event: frontmatter.talk.event ?? '',
          tags: frontmatter.talk.tags ?? [],
          duration: frontmatter.talk.duration ?? '',
          description: frontmatter.talk.description?.trim() ?? '',
          year: yearDir.name,
          name: talkDir.name,
          slideType: 'local',
        });
      } else if (fs.existsSync(metadataPath)) {
        try {
          const content = fs.readFileSync(metadataPath, 'utf-8');
          const metadata = yaml.load(content) as MetadataYaml;
          if (!metadata?.talk?.date) continue;

          const externalType = metadata.external?.type;
          const slideType: SlideType =
            externalType && VALID_EXTERNAL_TYPES.includes(externalType as (typeof VALID_EXTERNAL_TYPES)[number])
              ? (externalType as SlideType)
              : 'local';

          entries.push({
            title: metadata.title ?? talkDir.name,
            date: metadata.talk.date,
            event: metadata.talk.event ?? '',
            tags: metadata.talk.tags ?? [],
            duration: metadata.talk.duration ?? '',
            description: metadata.talk.description?.trim() ?? '',
            year: yearDir.name,
            name: talkDir.name,
            slideType,
          });
        } catch {
          // skip invalid metadata
        }
      }
    }
  }

  // Sort by date descending
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const outDir = path.join(process.cwd(), 'src', 'content', 'talks');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
  console.log(`Generated ${outPath} (${entries.length} talks)`);
};

main();
